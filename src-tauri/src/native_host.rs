use lattice_native_host::lifecycle::{Launcher, ProcessControl, ProcessEvent, SpawnedProcess};
use lattice_native_host::{child_environment, HostError, LaunchCredential};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

pub struct TauriLauncher<R: Runtime>(pub AppHandle<R>);

fn process_event(event: CommandEvent) -> Option<ProcessEvent> {
    match event {
        CommandEvent::Stdout(bytes) => Some(ProcessEvent::Stdout(bytes)),
        CommandEvent::Terminated(exit) => Some(ProcessEvent::Exited(
            exit.code == Some(0) && exit.signal.is_none(),
        )),
        CommandEvent::Error(_) => Some(ProcessEvent::Error),
        _ => None,
    }
}

struct ChildControl(Mutex<Option<CommandChild>>);
impl ProcessControl for ChildControl {
    fn terminate(&self) {
        let child = self.0.lock().ok().and_then(|mut c| c.take());
        if let Some(child) = child {
            // The plugin kill call waits for exit. Keep it off the event loop;
            // the coordinator separately waits for a bounded exit receipt.
            std::thread::spawn(move || {
                let _ = child.kill();
            });
        }
    }
    fn release(&self) {
        if let Ok(mut child) = self.0.lock() {
            child.take();
        }
    }
}
impl Drop for ChildControl {
    fn drop(&mut self) {
        self.terminate();
    }
}

impl<R: Runtime> Launcher for TauriLauncher<R> {
    fn spawn(&self, credential: &LaunchCredential) -> Result<SpawnedProcess, HostError> {
        let dir = self
            .0
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
        let mut command = self
            .0
            .shell()
            .sidecar("lattice-harness")
            .map_err(|_| HostError::SpawnFailed)?
            .env_clear()
            .current_dir(dir)
            .args(["--parent-stdio"])
            .set_raw_out(true)
            .set_process_group(true);
        for (key, value) in child_environment() {
            command = command.env(key, value);
        }
        let (mut output, child) = command
            .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
            .spawn()
            .map_err(|_| HostError::SpawnFailed)?;
        let control = Arc::new(ChildControl(Mutex::new(Some(child))));
        let (tx, events) = tokio::sync::mpsc::channel(32);
        tauri::async_runtime::spawn(async move {
            while let Some(event) = output.recv().await {
                let Some(event) = process_event(event) else {
                    continue;
                };
                if tx.send(event).await.is_err() {
                    break;
                }
            }
        });
        Ok(SpawnedProcess { control, events })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_shell::process::TerminatedPayload;

    #[test]
    fn only_a_normal_zero_exit_confirms_clean_termination() {
        for (code, signal, expected) in [
            (Some(0), None, true),
            (Some(1), None, false),
            (None, Some(9), false),
        ] {
            assert!(
                matches!(process_event(CommandEvent::Terminated(TerminatedPayload{code,signal})),Some(ProcessEvent::Exited(clean)) if clean==expected)
            );
        }
    }

    #[test]
    fn child_logs_and_raw_error_details_do_not_cross_the_adapter() {
        assert!(process_event(CommandEvent::Stderr(b"private child log".to_vec())).is_none());
        assert!(matches!(
            process_event(CommandEvent::Error("private error detail".into())),
            Some(ProcessEvent::Error)
        ));
    }
}
