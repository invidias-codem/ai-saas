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

#[tokio::test]
async fn rust_status_authenticates_with_this_launchs_credential() {
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
        .expect("spawn real daemon");
    let port = port(&mut child).await;
    let wrong = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    assert!(matches!(wrong.status().await, Err(HostError::RpcRejected)));
    let session = RpcSession::new(port, credential).unwrap();
    assert!(session.status().await.unwrap().events.is_empty());
    session.close();
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
