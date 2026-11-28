use lattice_native_host::lifecycle::{
    Launcher, NativeHost, ProcessControl, ProcessEvent, SpawnedProcess,
};
use lattice_native_host::workspace::{DialogFuture, FolderPicker, ReadInput};
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

struct SessionPicker {
    path: PathBuf,
    gate: Option<(Arc<tokio::sync::Notify>, Arc<tokio::sync::Notify>)>,
}
impl FolderPicker for SessionPicker {
    fn pick_folder(&self) -> DialogFuture<'_, Option<PathBuf>> {
        Box::pin(async { Ok(Some(self.path.clone())) })
    }
    fn confirm_read_access(&self, _path: String) -> DialogFuture<'_, bool> {
        Box::pin(async move {
            if let Some((started, release)) = &self.gate {
                started.notify_one();
                release.notified().await;
            }
            Ok(true)
        })
    }
}

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
    native: bool,
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
        let mut command = Command::new(&self.binary);
        command.arg("--parent-stdio");
        if self.native {
            command.arg("--native-host");
        }
        let mut child = command
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
            native: true,
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

// Command ownership remains tested through the explicitly standalone adapter.
// The desktop's native allowlist must not be relaxed to start a test command.
async fn standalone(launcher: &RealLauncher) -> (RealLauncher, SpawnedProcess) {
    let mut launcher = launcher.clone();
    launcher.native = false;
    let process = launcher
        .spawn(&LaunchCredential::generate().unwrap())
        .unwrap();
    until(|| launcher.latest().port.load(Ordering::Acquire) != 0).await;
    (launcher, process)
}

async fn clean_standalone_exit(mut process: SpawnedProcess) {
    tokio::time::timeout(Duration::from_secs(8), async {
        while let Some(event) = process.events.recv().await {
            if let ProcessEvent::Exited(clean) = event {
                assert!(clean, "standalone cleanup was not confirmed");
                process.control.release();
                return;
            }
        }
        panic!("missing standalone exit receipt");
    })
    .await
    .unwrap();
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
    let workspace = dir.path().join("selected");
    std::fs::create_dir(&workspace).unwrap();
    std::fs::write(workspace.join("note.md"), "selected").unwrap();
    let mut grant = host
        .select_folder(SessionPicker {
            path: workspace.clone(),
            gate: None,
        })
        .await
        .unwrap()
        .unwrap();
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
        assert!(
            host.workspace_grants().await.unwrap().is_empty(),
            "restart restored a remembered grant"
        );
        assert!(matches!(
            host.read_text(ReadInput {
                grant_id: grant.grant_id.clone(),
                relative_path: "note.md".into()
            })
            .await,
            Err(HostError::GrantDenied)
        ));
        let next = host
            .select_folder(SessionPicker {
                path: workspace.clone(),
                gate: None,
            })
            .await
            .unwrap()
            .unwrap();
        assert_ne!(grant.grant_id, next.grant_id);
        grant = next;
    }
    assert_eq!(launcher.peak.load(Ordering::Acquire), 1);
    host.shutdown().await.unwrap();
    assert_eq!(launcher.active.load(Ordering::Acquire), 0);
    assert!(matches!(host.status().await, Err(HostError::Closed)));
}

#[tokio::test]
async fn restart_invalidates_a_pending_native_confirmation() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, _)) = fixture(dir.path()) else {
        return;
    };
    let host = Arc::new(NativeHost::default());
    host.start(launcher.clone()).await.unwrap();
    let started = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let picker = SessionPicker {
        path: dir.path().to_owned(),
        gate: Some((started.clone(), release.clone())),
    };
    let caller = host.clone();
    let selection = tokio::spawn(async move { caller.select_folder(picker).await });
    started.notified().await;
    host.restart(launcher).await.unwrap();
    release.notify_one();
    assert!(matches!(selection.await.unwrap(), Err(HostError::Closed)));
    assert!(host.workspace_grants().await.unwrap().is_empty());
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn native_confirmation_remains_owned_when_its_ipc_caller_disappears() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, _)) = fixture(dir.path()) else {
        return;
    };
    let host = Arc::new(NativeHost::default());
    host.start(launcher).await.unwrap();
    let started = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let picker = SessionPicker {
        path: dir.path().to_owned(),
        gate: Some((started.clone(), release.clone())),
    };
    let caller = host.clone();
    let selection = tokio::spawn(async move { caller.select_folder(picker).await });
    started.notified().await;
    assert!(matches!(
        host.select_folder(SessionPicker {
            path: dir.path().to_owned(),
            gate: None
        })
        .await,
        Err(HostError::Busy)
    ));
    selection.abort();
    release.notify_one();
    let grants = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            match host.workspace_grants().await {
                Ok(grants) if !grants.is_empty() => break grants,
                Ok(_) | Err(HostError::Busy) => {}
                Err(error) => panic!("owned grant transition failed: {error}"),
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(grants.len(), 1);
    host.revoke_grant(grants[0].grant_id.clone()).await.unwrap();
    assert!(host.workspace_grants().await.unwrap().is_empty());
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn revocation_invalidates_an_already_open_folder_confirmation() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, _)) = fixture(dir.path()) else {
        return;
    };
    let host = Arc::new(NativeHost::default());
    host.start(launcher).await.unwrap();
    let first = host
        .select_folder(SessionPicker {
            path: dir.path().to_owned(),
            gate: None,
        })
        .await
        .unwrap()
        .unwrap();
    let started = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let picker = SessionPicker {
        path: dir.path().to_owned(),
        gate: Some((started.clone(), release.clone())),
    };
    let caller = host.clone();
    let selection = tokio::spawn(async move { caller.select_folder(picker).await });
    started.notified().await;
    host.revoke_grant(first.grant_id).await.unwrap();
    release.notify_one();
    assert!(matches!(
        selection.await.unwrap(),
        Err(HostError::GrantDenied)
    ));
    assert!(host.workspace_grants().await.unwrap().is_empty());
    host.shutdown().await.unwrap();
}

#[tokio::test]
async fn standalone_shutdown_joins_command_tree_before_native_launch() {
    let dir = tempfile::tempdir().unwrap();
    let Some((launcher, helper)) = fixture(dir.path()) else {
        return;
    };
    let workspace = dir.path().join("workspace");
    let (standalone, process) = standalone(&launcher).await;
    let request = start_tree(&standalone, &helper, &workspace).await;
    let snapshot = standalone.latest();
    let stopped = rpc(&snapshot, "shutdown", json!({}), &snapshot.token)
        .await
        .unwrap();
    assert_eq!(stopped["result"]["ok"], true);
    clean_standalone_exit(process).await;
    let _ = tokio::time::timeout(Duration::from_secs(2), request)
        .await
        .unwrap()
        .unwrap();
    tokio::time::sleep(Duration::from_millis(1800)).await;
    assert!(
        !workspace.join("escaped").exists(),
        "descendant outlived restart"
    );
    let host = Arc::new(NativeHost::default());
    host.start(launcher.clone()).await.unwrap();
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
    let (standalone, process) = standalone(&launcher).await;
    let request = start_tree(&standalone, &helper, &workspace).await;
    standalone
        .latest()
        .control
        .0
        .lock()
        .unwrap()
        .as_mut()
        .unwrap()
        .stdin
        .take();
    clean_standalone_exit(process).await;
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
