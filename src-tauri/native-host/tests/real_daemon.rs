use lattice_native_host::workspace::{DialogFuture, FolderPicker, ReadInput};
use lattice_native_host::{
    child_environment, HostError, LaunchCredential, RpcSession, StartupHandshake, STARTUP_TIMEOUT,
};
use std::{process::Stdio, sync::Arc};
use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
};

async fn port(child: &mut Child) -> u16 {
    let mut stdout = child.stdout.take().unwrap();
    let mut handshake = StartupHandshake::default();
    tokio::time::timeout(STARTUP_TIMEOUT, async {
        let mut chunk = [0u8; 1024];
        loop {
            let n = stdout.read(&mut chunk).await.expect("native stdout");
            assert!(n > 0, "daemon exited before readiness");
            if let Some(port) = handshake.push(&chunk[..n]).expect("valid native handshake") {
                return port;
            }
        }
    })
    .await
    .expect("bounded native startup")
}

fn binary() -> Option<std::ffi::OsString> {
    let path = std::env::var_os("LATTICE_TEST_DAEMON_PATH");
    if path.is_none() {
        eprintln!(
            "real-daemon test requires LATTICE_TEST_DAEMON_PATH (mandatory in native-host CI)"
        );
    }
    path
}

struct DirectoryPicker {
    path: std::path::PathBuf,
    replace: bool,
}
impl FolderPicker for DirectoryPicker {
    fn pick_folder(&self) -> DialogFuture<'_, Option<std::path::PathBuf>> {
        Box::pin(async { Ok(Some(self.path.clone())) })
    }
    fn confirm_read_access(&self, path: String) -> DialogFuture<'_, bool> {
        Box::pin(async move {
            assert_eq!(
                std::fs::canonicalize(&path).unwrap(),
                std::fs::canonicalize(&self.path).unwrap()
            );
            if self.replace {
                let old = self.path.with_extension("pinned");
                std::fs::rename(&self.path, &old).unwrap();
                std::fs::create_dir(&self.path).unwrap();
                std::fs::write(self.path.join("note.md"), "replacement").unwrap();
            }
            Ok(true)
        })
    }
}

async fn native_session(binary: std::ffi::OsString, dir: &std::path::Path) -> (Child, RpcSession) {
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .arg("--native-host")
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let port = port(&mut child).await;
    let session = RpcSession::new(port, credential).unwrap();
    session.bind_native().await.unwrap();
    (child, session)
}

#[tokio::test]
async fn native_selected_directory_identity_and_typed_reads_work_with_real_go() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    std::fs::write(selected.join("note.md"), "selected text\n资料").unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    let grant = session
        .select_folder(&DirectoryPicker {
            path: selected,
            replace: false,
        })
        .await
        .unwrap()
        .unwrap();
    let input = ReadInput {
        grant_id: grant.grant_id.clone(),
        relative_path: "note.md".into(),
    };
    assert_eq!(
        session.read_text(input.clone()).await.unwrap().content,
        "selected text\n资料"
    );
    assert!(session.stat_path(input.clone()).await.unwrap().size > 0);
    assert_eq!(
        session
            .list_directory(ReadInput {
                relative_path: ".".into(),
                ..input.clone()
            })
            .await
            .unwrap()
            .entries[0]
            .name,
        "note.md"
    );
    session.revoke_grant(&grant.grant_id).await.unwrap();
    assert!(matches!(
        session.read_text(input).await,
        Err(HostError::GrantDenied)
    ));
    session.status().await.unwrap();
    session.shutdown().await.unwrap();
    assert!(tokio::time::timeout(STARTUP_TIMEOUT, child.wait())
        .await
        .unwrap()
        .unwrap()
        .success());
}

#[tokio::test]
async fn directory_replaced_during_native_confirmation_never_grants_the_replacement() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let selected = dir.path().join("project");
    std::fs::create_dir(&selected).unwrap();
    std::fs::write(selected.join("note.md"), "selected").unwrap();
    let (mut child, session) = native_session(binary, dir.path()).await;
    assert!(matches!(
        session
            .select_folder(&DirectoryPicker {
                path: selected,
                replace: true
            })
            .await,
        Err(HostError::WorkspaceBlocked)
    ));
    assert!(matches!(
        session.workspace_grants().await,
        Err(HostError::WorkspaceBlocked)
    ));
    session.shutdown().await.unwrap();
    assert!(tokio::time::timeout(STARTUP_TIMEOUT, child.wait())
        .await
        .unwrap()
        .unwrap()
        .success());
}

#[tokio::test]
async fn rust_status_authenticates_with_this_launchs_credential() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .arg("--native-host")
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .expect("spawn real daemon");
    let port = port(&mut child).await;
    let wrong = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    assert!(matches!(wrong.status().await, Err(HostError::RpcRejected)));
    let session = RpcSession::new(port, credential).unwrap();
    assert!(session.status().await.unwrap().events.is_empty());
    session
        .bind_native()
        .await
        .expect("enroll the real native daemon");
    assert!(session.status().await.unwrap().events.is_empty());
    assert!(
        !dir.path().join("lattice_vectors.db").exists(),
        "native mode initialized unexposed shared memory"
    );
    session.close();
    assert!(matches!(session.status().await, Err(HostError::Closed)));
    child.kill().await.unwrap();
    child.wait().await.unwrap();
}

#[tokio::test]
async fn standalone_daemons_cannot_satisfy_native_enrollment() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let mut child = Command::new(binary)
        .env_clear()
        .envs(child_environment())
        .env("LATTICE_AUTH_TOKEN", credential.child_env_value())
        .current_dir(dir.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let port = port(&mut child).await;
    let session = RpcSession::new(port, credential).unwrap();
    assert!(session.bind_native().await.is_err());
    assert!(matches!(session.status().await, Err(HostError::Closed)));
    child.kill().await.unwrap();
    child.wait().await.unwrap();
}

#[tokio::test]
async fn missing_launch_auth_exits_without_a_ready_frame() {
    let Some(binary) = binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let output = tokio::time::timeout(
        STARTUP_TIMEOUT,
        Command::new(binary)
            .env_clear()
            .envs(child_environment())
            .current_dir(dir.path())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(!output.status.success());
    assert!(
        output.stdout.is_empty(),
        "unauthenticated startup must not advertise readiness"
    );
}
