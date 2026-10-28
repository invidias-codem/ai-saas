use lattice_native_host::{
    child_environment, HostError, LaunchCredential, RpcSession, StartupHandshake, Status,
    STARTUP_TIMEOUT,
};
use std::sync::{Arc, Mutex, Weak};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tokio::sync::oneshot;

// Only the Rust owner holds the child. Drop also handles a partially completed
// launch. The handle is always taken out of the state lock before waiting.
struct OwnedChild(Option<CommandChild>);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if let Some(child) = self.0.take() {
            let _ = child.kill();
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Booting,
    Ready,
    Failed(HostError),
    Stopped,
}

struct State {
    generation: u64,
    launch_started: bool,
    phase: Phase,
    session: Option<Arc<RpcSession>>,
    child: Option<OwnedChild>,
}

pub struct NativeHost {
    state: Mutex<State>,
}

impl Default for NativeHost {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                generation: 1,
                launch_started: false,
                phase: Phase::Booting,
                session: None,
                child: None,
            }),
        }
    }
}

impl NativeHost {
    pub fn phase(&self) -> Phase {
        self.state
            .lock()
            .map(|s| s.phase)
            .unwrap_or(Phase::Failed(HostError::StateUnavailable))
    }
    fn fail(&self, generation: u64, error: HostError) {
        let child = {
            let Ok(mut s) = self.state.lock() else { return };
            if s.generation != generation || matches!(s.phase, Phase::Stopped | Phase::Failed(_)) {
                return;
            }
            s.phase = Phase::Failed(error);
            if let Some(session) = s.session.take() {
                session.close();
            }
            s.child.take()
        };
        drop(child);
    }
    pub fn stop(&self) {
        let child = {
            let Ok(mut s) = self.state.lock() else { return };
            s.generation += 1;
            s.phase = Phase::Stopped;
            if let Some(session) = s.session.take() {
                session.close();
            }
            s.child.take()
        };
        drop(child);
    }
    pub async fn status(&self) -> Result<Option<Status>, HostError> {
        let (generation, session) = {
            let s = self.state.lock().map_err(|_| HostError::StateUnavailable)?;
            match s.phase {
                Phase::Booting => return Ok(None),
                Phase::Stopped => return Err(HostError::Closed),
                Phase::Failed(error) => return Err(error),
                Phase::Ready => (
                    s.generation,
                    s.session.clone().ok_or(HostError::StateUnavailable)?,
                ),
            }
        };
        let status = session.status().await;
        let still_current = self
            .state
            .lock()
            .map(|s| s.generation == generation && s.phase == Phase::Ready)
            .unwrap_or(false);
        if !still_current {
            return Err(HostError::Closed);
        }
        match status {
            Ok(data) => Ok(Some(data)),
            Err(HostError::Busy) => Err(HostError::Busy),
            Err(error) => {
                self.fail(generation, error);
                Err(error)
            }
        }
    }
}

impl Drop for NativeHost {
    fn drop(&mut self) {
        self.stop();
    }
}

// Setup owns app path resolution. The long-lived monitor holds only a Weak
// host reference, so it cannot keep the application/child alive after exit.
pub async fn start<R: Runtime>(app: AppHandle<R>, host: Arc<NativeHost>) {
    let generation = {
        let Ok(mut state) = host.state.lock() else {
            return;
        };
        if state.launch_started || state.phase != Phase::Booting {
            return;
        }
        state.launch_started = true;
        state.generation
    };
    if let Err(error) = launch(app, &host, generation).await {
        host.fail(generation, error);
    }
}

async fn launch<R: Runtime>(
    app: AppHandle<R>,
    host: &Arc<NativeHost>,
    generation: u64,
) -> Result<(), HostError> {
    let credential = Arc::new(LaunchCredential::generate()?);
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|_| HostError::StorageUnavailable)?
        .join("native-host");
    std::fs::create_dir_all(&dir).map_err(|_| HostError::StorageUnavailable)?;
    let info = std::fs::symlink_metadata(&dir).map_err(|_| HostError::StorageUnavailable)?;
    if !info.is_dir() || info.file_type().is_symlink() {
        return Err(HostError::StorageUnavailable);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| HostError::StorageUnavailable)?;
    }
    let mut command = app
        .shell()
        .sidecar("lattice-harness")
        .map_err(|_| HostError::SpawnFailed)?
        .env_clear()
        .current_dir(dir)
        .set_raw_out(true)
        .set_process_group(true);
    for (key, value) in child_environment() {
        command = command.env(key, value);
    }
    let (rx, child) = command
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .spawn()
        .map_err(|_| HostError::SpawnFailed)?;
    let mut child = Some(OwnedChild(Some(child)));
    {
        let mut state = host.state.lock().map_err(|_| HostError::StateUnavailable)?;
        if state.generation != generation || state.phase != Phase::Booting {
            return Err(HostError::Closed);
        }
        state.child = child.take();
    }
    drop(app);
    let (sender, ready) = oneshot::channel();
    tauri::async_runtime::spawn(monitor(rx, Arc::downgrade(host), generation, sender));
    let verify = async {
        let port = ready.await.map_err(|_| HostError::Exited)??;
        let session = Arc::new(RpcSession::new(port, credential)?);
        {
            let mut state = host.state.lock().map_err(|_| HostError::StateUnavailable)?;
            if state.generation != generation || state.phase != Phase::Booting {
                return Err(HostError::Closed);
            }
            state.session = Some(session.clone());
        }
        session.status().await?;
        let mut state = host.state.lock().map_err(|_| HostError::StateUnavailable)?;
        if state.generation != generation || state.phase != Phase::Booting {
            return Err(HostError::Closed);
        }
        state.phase = Phase::Ready;
        Ok(())
    };
    tokio::time::timeout(STARTUP_TIMEOUT, verify)
        .await
        .map_err(|_| HostError::StartupTimeout)?
}

async fn monitor(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    host: Weak<NativeHost>,
    generation: u64,
    sender: oneshot::Sender<Result<u16, HostError>>,
) {
    let mut sender = Some(sender);
    let mut handshake = StartupHandshake::default();
    while let Some(event) = rx.recv().await {
        let error = match event {
            CommandEvent::Stdout(bytes) if sender.is_some() => match handshake.push(&bytes) {
                Ok(Some(port)) => {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(Ok(port));
                    }
                    None
                }
                Ok(None) => None,
                Err(error) => Some(error),
            },
            CommandEvent::Terminated(_) | CommandEvent::Error(_) => Some(HostError::Exited),
            // Drain raw output without retaining or forwarding child logs.
            _ => None,
        };
        if let Some(error) = error {
            if let Some(sender) = sender.take() {
                let _ = sender.send(Err(error));
            }
            if let Some(host) = host.upgrade() {
                host.fail(generation, error);
            }
            return;
        }
    }
    if let Some(host) = host.upgrade() {
        host.fail(generation, HostError::Exited);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stdout_readiness_alone_never_marks_the_host_ready() {
        let host = Arc::new(NativeHost::default());
        let (tx, rx) = tokio::sync::mpsc::channel(4);
        let (sender, ready) = oneshot::channel();
        let task = tokio::spawn(monitor(rx, Arc::downgrade(&host), 1, sender));
        tx.send(CommandEvent::Stdout(
            b"{\"status\":\"ready\",\"port\":49123}\n".to_vec(),
        ))
        .await
        .unwrap();
        assert_eq!(ready.await.unwrap().unwrap(), 49123);
        assert!(host.status().await.unwrap().is_none());
        drop(tx);
        task.await.unwrap();
        assert!(matches!(host.status().await, Err(HostError::Exited)));
    }

    #[tokio::test]
    async fn malformed_child_output_fails_without_forwarding_it() {
        let host = Arc::new(NativeHost::default());
        let (tx, rx) = tokio::sync::mpsc::channel(4);
        let (sender, ready) = oneshot::channel();
        tx.send(CommandEvent::Stdout(b"untrusted child output\n".to_vec()))
            .await
            .unwrap();
        monitor(rx, Arc::downgrade(&host), 1, sender).await;
        assert_eq!(ready.await.unwrap(), Err(HostError::InvalidHandshake));
        assert!(matches!(
            host.status().await,
            Err(HostError::InvalidHandshake)
        ));
    }

    #[tokio::test]
    async fn shutdown_invalidates_the_session_and_ignores_late_child_events() {
        let host = Arc::new(NativeHost::default());
        let session = Arc::new(
            RpcSession::new(49123, Arc::new(LaunchCredential::generate().unwrap())).unwrap(),
        );
        host.state.lock().unwrap().session = Some(session.clone());
        let (tx, rx) = tokio::sync::mpsc::channel(4);
        let (sender, _ready) = oneshot::channel();
        host.stop();
        tx.send(CommandEvent::Error("late child error".into()))
            .await
            .unwrap();
        monitor(rx, Arc::downgrade(&host), 1, sender).await;
        assert!(host.phase() == Phase::Stopped);
        assert!(matches!(session.status().await, Err(HostError::Closed)));
        assert!(matches!(host.status().await, Err(HostError::Closed)));
    }
}
