#![cfg(target_os = "linux")]

use lattice_credential_broker::{CredentialBroker, CredentialError, CredentialKind, ProviderKind};
use std::process::Command;

#[test]
fn unavailable_keyring_does_not_select_a_memory_store() {
    let directory = tempfile::tempdir().unwrap();
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "missing_bus_child", "--nocapture"])
        .env("LATTICE_TEST_MISSING_BUS", "1")
        .env(
            "DBUS_SESSION_BUS_ADDRESS",
            format!(
                "unix:path={}",
                directory.path().join("missing-bus").display()
            ),
        )
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[tokio::test]
async fn missing_bus_child() {
    if std::env::var_os("LATTICE_TEST_MISSING_BUS").is_none() {
        return;
    }
    let broker = CredentialBroker::new()
        .await
        .expect("the app can initialize before a keyring is available");
    let result = broker
        .store_credential(
            ProviderKind::OpenAI,
            CredentialKind::ApiKey,
            "synthetic test value",
            "test",
            None,
            None,
        )
        .await;
    assert!(
        matches!(result, Err(CredentialError::StoreUnavailable(_))),
        "credential operations must still fail closed"
    );
}
