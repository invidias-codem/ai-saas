//! Real-daemon fixture for native IPC tests; never compiled into an app build.
use lattice_native_host::{
    child_environment,
    lifecycle::{Launcher, NativeHost, ProcessControl, ProcessEvent, SpawnedProcess},
    workspace::{DialogFuture, FolderPicker},
    HostError, LaunchCredential,
};
use std::{
    io::Read,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::mpsc;

struct Control(Mutex<Option<Child>>);
impl ProcessControl for Control {
    fn terminate(&self) {
        if let Some(child) = self.0.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
    fn release(&self) {
        self.0.lock().unwrap().take();
    }
}
struct RealLauncher {
    binary: PathBuf,
    dir: PathBuf,
}
impl Launcher for RealLauncher {
    fn spawn(&self, credential: &LaunchCredential) -> Result<SpawnedProcess, HostError> {
        let mut child = Command::new(&self.binary)
            .args(["--native-host", "--parent-stdio"])
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
        let control = Arc::new(Control(Mutex::new(Some(child))));
        let (tx, events) = mpsc::channel(32);
        let output = tx.clone();
        std::thread::spawn(move || {
            let mut bytes = [0; 1024];
            loop {
                match stdout.read(&mut bytes) {
                    Ok(0) => break,
                    Ok(n) => {
                        if output
                            .blocking_send(ProcessEvent::Stdout(bytes[..n].to_vec()))
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        let waiter = control.clone();
        std::thread::spawn(move || loop {
            let status = {
                let mut guard = waiter.0.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => c.try_wait(),
                    None => return,
                }
            };
            match status {
                Ok(Some(s)) => {
                    let _ = tx.blocking_send(ProcessEvent::Exited(s.success()));
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
struct Picker(PathBuf);
impl FolderPicker for Picker {
    fn pick_folder(&self) -> DialogFuture<'_, Option<PathBuf>> {
        Box::pin(async { Ok(Some(self.0.clone())) })
    }
    fn confirm_read_access(&self, _: String) -> DialogFuture<'_, bool> {
        Box::pin(async { Ok(true) })
    }
}
pub(super) struct Fixture {
    pub host: Arc<NativeHost>,
    pub grant_id: String,
    pub project: PathBuf,
    _dir: tempfile::TempDir,
}
impl Fixture {
    pub fn start() -> Self {
        let binary=std::env::var_os("LATTICE_TEST_DAEMON_PATH").expect("full native IPC tests require this revision's sidecar; CI must set LATTICE_TEST_DAEMON_PATH");
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let service = dir.path().join("service");
        std::fs::create_dir(&service).unwrap();
        let host = Arc::new(NativeHost::default());
        tauri::async_runtime::block_on(host.start(RealLauncher {
            binary: binary.into(),
            dir: service,
        }))
        .unwrap();
        let grant = tauri::async_runtime::block_on(host.select_folder(Picker(project.clone())))
            .unwrap()
            .unwrap();
        Self {
            host,
            grant_id: grant.grant_id,
            project,
            _dir: dir,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let result = tauri::async_runtime::block_on(self.host.shutdown());
        if !std::thread::panicking() {
            assert!(result.is_ok(), "native fixture cleanup was not confirmed");
        }
    }
}
