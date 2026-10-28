use lattice_native_host::lifecycle::{
    Launcher, NativeHost, ProcessControl, ProcessEvent, SpawnedProcess,
};
use lattice_native_host::{child_environment, HostError, LaunchCredential, StartupHandshake};
use serde_json::{json, Value};
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU16, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::mpsc;
use zeroize::Zeroizing;

struct ChildControl(Mutex<Option<Child>>);
impl ProcessControl for ChildControl {
    fn terminate(&self) {
        if let Some(child) = self.0.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
    fn release(&self) {
        self.0.lock().unwrap().take();
    }
}
struct Snapshot {
    control: Arc<ChildControl>,
    token: Zeroizing<String>,
    port: AtomicU16,
}
#[derive(Clone)]
struct RealLauncher {
    binary: PathBuf,
    dir: PathBuf,
    launches: Arc<Mutex<Vec<Arc<Snapshot>>>>,
    active: Arc<AtomicUsize>,
    peak: Arc<AtomicUsize>,
}
impl RealLauncher {
    fn latest(&self) -> Arc<Snapshot> {
        self.launches.lock().unwrap().last().unwrap().clone()
    }
}
impl Launcher for RealLauncher {
    fn spawn(&self, credential: &LaunchCredential) -> Result<SpawnedProcess, HostError> {
        let mut child = Command::new(&self.binary)
            .args(["--parent-stdio"])
            .env_clear()
            .envs(child_environment())
            .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
            .current_dir(&self.dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| HostError::SpawnFailed)?;
        let mut stdout = child.stdout.take().unwrap();
        let control = Arc::new(ChildControl(Mutex::new(Some(child))));
        let snapshot = Arc::new(Snapshot {
            control: control.clone(),
            token: Zeroizing::new(credential.child_env_value().to_owned()),
            port: AtomicU16::new(0),
        });
        self.launches.lock().unwrap().push(snapshot.clone());
        let count = self.active.fetch_add(1, Ordering::AcqRel) + 1;
        self.peak.fetch_max(count, Ordering::AcqRel);
        let (tx, events) = mpsc::channel(32);
        let output = tx.clone();
        std::thread::spawn(move || {
            let mut parser = StartupHandshake::default();
            let mut bytes = [0u8; 1024];
            loop {
                match stdout.read(&mut bytes) {
                    Ok(0) => break,
                    Ok(n) => {
                        if snapshot.port.load(Ordering::Acquire) == 0 {
                            if let Ok(Some(port)) = parser.push(&bytes[..n]) {
                                snapshot.port.store(port, Ordering::Release);
                            }
                        }
                        if output
                            .blocking_send(ProcessEvent::Stdout(bytes[..n].to_vec()))
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(_) => {
                        let _ = output.blocking_send(ProcessEvent::Error);
                        break;
                    }
                }
            }
        });
        let waiter = control.clone();
        let active = self.active.clone();
        std::thread::spawn(move || loop {
            let status = {
                let mut lock = waiter.0.lock().unwrap();
                match lock.as_mut() {
                    Some(child) => child.try_wait(),
                    None => return,
                }
            };
            match status {
                Ok(Some(status)) => {
                    active.fetch_sub(1, Ordering::AcqRel);
                    let _ = tx.blocking_send(ProcessEvent::Exited(status.success()));
                    return;
                }
                Err(_) => {
                    let _ = tx.blocking_send(ProcessEvent::Error);
                    return;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(5)),
            }
        });
        Ok(SpawnedProcess { control, events })
    }
}

fn fixture(dir: &Path) -> Option<(RealLauncher, PathBuf)> {
    let Some(binary) = std::env::var_os("LATTICE_TEST_DAEMON_PATH") else {
        eprintln!("real lifecycle tests require LATTICE_TEST_DAEMON_PATH and LATTICE_TEST_PROCESS_HELPER_PATH (mandatory in CI)");
        return None;
    };
    let helper = std::env::var_os("LATTICE_TEST_PROCESS_HELPER_PATH")
        .expect("build this revision's executil process helper");
    Some((
        RealLauncher {
            binary: binary.into(),
            dir: dir.into(),
            launches: Arc::new(Mutex::new(Vec::new())),
            active: Arc::new(AtomicUsize::new(0)),
            peak: Arc::new(AtomicUsize::new(0)),
        },
        helper.into(),
    ))
}
async fn rpc(snapshot: &Snapshot, action: &str, inputs: Value, token: &str) -> Result<Value, ()> {
    reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(12)).build().unwrap()
        .post(format!("http://127.0.0.1:{}/rpc",snapshot.port.load(Ordering::Acquire)))
        .json(&json!({"id":"real-lifecycle","jsonrpc":"2.0","authToken":token,"action":action,"inputs":inputs}))
        .send().await.map_err(|_|())?.json().await.map_err(|_|())
}
async fn until(mut condition: impl FnMut() -> bool) {
    tokio::time::timeout(Duration::from_secs(8), async {
        while !condition() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("bounded lifecycle observation");
}
async fn start_tree(
    launcher: &RealLauncher,
    helper: &Path,
    workspace: &Path,
) -> tokio::task::JoinHandle<Result<Value, ()>> {
    std::fs::create_dir_all(workspace).unwrap();
    let snapshot = launcher.latest();
    let grants=rpc(&snapshot,"sync_root_grants",json!({"api_base_url":"","auth_token":"","user_id":"employee","workspace_id":"project","grants":[{"path":workspace,"user_id":"employee","workspace_id":"project","allow_destructive":true}]}),&snapshot.token).await.unwrap();
    assert_eq!(grants["result"]["ok"], true);
    let command = format!(
        "\"{}\" -test.run=^TestManagedProcessHelper$ -- --lattice-helper spawn \"{}\"",
        helper.display(),
        workspace.display()
    );
    let path = workspace.to_path_buf();
    let request = tokio::spawn(async move {
        rpc(&snapshot,"execute_command_secure",json!({"path":path,"user_id":"employee","workspace_id":"project","command":command,"timeout_seconds":30}),&snapshot.token).await
    });
    until(|| workspace.join("started").exists()).await;
    request
}

#[tokio::test]
async fn repeated_restart_rotates_auth_and_never_overlaps_generations() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, _)) = fixture(dir.path()) else {
        return;
    };
    let host = Arc::new(NativeHost::default());
    host.start(launcher.clone()).await.unwrap();
    for _ in 0..3 {
        let retired = launcher.latest();
        host.restart(launcher.clone()).await.unwrap();
        let current = launcher.latest();
        let rejected = rpc(&current, "status", json!({}), &retired.token)
            .await
            .unwrap();
        assert!(
            rejected.get("error").is_some(),
            "retired credential authenticated a new generation"
        );
        assert!(host.status().await.unwrap().is_some());
    }
    assert_eq!(launcher.peak.load(Ordering::Acquire), 1);
    host.shutdown().await.unwrap();
    assert_eq!(launcher.active.load(Ordering::Acquire), 0);
    assert!(matches!(host.status().await, Err(HostError::Closed)));
}

#[tokio::test]
async fn restart_joins_a_granted_command_tree_and_drops_its_grants() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, helper)) = fixture(dir.path()) else {
        return;
    };
    let workspace = dir.path().join("workspace");
    let host = Arc::new(NativeHost::default());
    host.start(launcher.clone()).await.unwrap();
    let request = start_tree(&launcher, &helper, &workspace).await;
    host.restart(launcher.clone()).await.unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(2), request)
        .await
        .unwrap()
        .unwrap();
    tokio::time::sleep(Duration::from_millis(1800)).await;
    assert!(
        !workspace.join("escaped").exists(),
        "descendant outlived restart"
    );
    let snapshot = launcher.latest();
    let denied = rpc(
        &snapshot,
        "read_file_secure",
        json!({"path":workspace.join("started"),"user_id":"employee","workspace_id":"project"}),
        &snapshot.token,
    )
    .await
    .unwrap();
    assert_ne!(
        denied["result"]["ok"], true,
        "old grants were carried into a new process"
    );
    assert_eq!(launcher.peak.load(Ordering::Acquire), 1);
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn parent_lifeline_loss_cancels_active_descendants() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, helper)) = fixture(dir.path()) else {
        return;
    };
    let workspace = dir.path().join("workspace");
    let host = Arc::new(NativeHost::default());
    host.start(launcher.clone()).await.unwrap();
    let request = start_tree(&launcher, &helper, &workspace).await;
    launcher
        .latest()
        .control
        .0
        .lock()
        .unwrap()
        .as_mut()
        .unwrap()
        .stdin
        .take();
    until(|| launcher.active.load(Ordering::Acquire) == 0).await;
    host.shutdown().await.unwrap();
    let _ = request.await.unwrap();
    tokio::time::sleep(Duration::from_millis(1800)).await;
    assert!(
        !workspace.join("escaped").exists(),
        "descendant outlived parent lifeline"
    );
}

#[tokio::test]
async fn a_crashed_daemon_cannot_be_replaced_without_confirmed_cleanup() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, _)) = fixture(dir.path()) else {
        return;
    };
    let host = Arc::new(NativeHost::default());
    host.start(launcher.clone()).await.unwrap();
    launcher.latest().control.terminate();
    until(|| launcher.active.load(Ordering::Acquire) == 0).await;
    assert_eq!(
        host.restart(launcher.clone()).await,
        Err(HostError::CleanupUncertain)
    );
    assert_eq!(launcher.launches.lock().unwrap().len(), 1);
    assert_eq!(host.shutdown().await, Err(HostError::CleanupUncertain));
}
