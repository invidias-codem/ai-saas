mod common;
use common::fixture;
use lattice_native_host::{HostError, LaunchCredential, RpcSession};
use std::sync::Arc;

#[tokio::test]
async fn enrollment_binds_native_generated_identity_and_scopes_heartbeats() {
    let (port, requests, task) = fixture("").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    session.status().await.unwrap();
    session.bind_native().await.unwrap();
    session.status().await.unwrap();
    let calls = requests.lock().unwrap();
    assert_eq!(calls.len(), 4);
    assert!(calls[0].get("authority").is_none());
    let a = &calls[2]["inputs"]["authority"];
    assert!(a["principal_id"]
        .as_str()
        .unwrap()
        .starts_with("local-user-"));
    assert!(a["workspace_id"]
        .as_str()
        .unwrap()
        .starts_with("local-workspace-"));
    assert_eq!(a["generation"].as_str().unwrap().len(), 32);
    assert_eq!(a["policy_revision"], 1);
    assert_eq!(a["grant_revision"], 0);
    assert_eq!(&calls[3]["authority"], a);
    task.abort();
}

#[tokio::test]
async fn incompatible_protocols_fail_closed_before_binding() {
    for fault in [
        "version",
        "mode",
        "features",
        "old-grants",
        "old-mutations",
        "old-commands",
        "unknown",
    ] {
        let (port, requests, task) = fixture(fault).await;
        let session =
            RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
        assert!(session.bind_native().await.is_err(), "accepted {fault}");
        assert_eq!(requests.lock().unwrap().len(), 1);
        assert!(matches!(session.status().await, Err(HostError::Closed)));
        task.abort();
    }
}

#[tokio::test]
async fn changed_binding_acknowledgement_closes_the_session() {
    let (port, _, task) = fixture("ack").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    assert!(session.bind_native().await.is_err());
    assert!(matches!(session.status().await, Err(HostError::Closed)));
    task.abort();
}

#[tokio::test]
async fn replacement_sessions_use_fresh_local_scope() {
    let (port, requests, task) = fixture("").await;
    for _ in 0..2 {
        let session =
            RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
        session.bind_native().await.unwrap();
    }
    let requests = requests.lock().unwrap();
    let authorities: Vec<_> = requests
        .iter()
        .filter(|r| r["action"] == "bind_native_session")
        .map(|r| &r["inputs"]["authority"])
        .collect();
    for field in ["principal_id", "workspace_id", "generation"] {
        assert_ne!(authorities[0][field], authorities[1][field]);
    }
    task.abort();
}

#[tokio::test]
async fn concurrent_enrollment_cannot_issue_a_second_binding_or_close_the_first() {
    let (port, requests, task) = fixture("").await;
    let session = RpcSession::new(port, Arc::new(LaunchCredential::generate().unwrap())).unwrap();
    let (first, second) = tokio::join!(session.bind_native(), session.bind_native());
    assert_eq!(first, Ok(()));
    assert_eq!(second, Err(HostError::Busy));
    session.status().await.unwrap();
    assert_eq!(
        requests
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r["action"] == "bind_native_session")
            .count(),
        1
    );
    task.abort();
}
