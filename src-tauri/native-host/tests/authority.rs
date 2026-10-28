use lattice_native_host::{HostError, LaunchCredential, RpcSession};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

async fn fixture(
    fault: &'static str,
) -> (u16, Arc<Mutex<Vec<Value>>>, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let capture = requests.clone();
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let body_start = loop {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0 && bytes.len() < 16384);
                bytes.extend_from_slice(&chunk[..n]);
                if let Some(p) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                    break p + 4;
                }
            };
            let headers = String::from_utf8_lossy(&bytes[..body_start]);
            let length: usize = headers
                .lines()
                .find_map(|l| {
                    l.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|s| s.trim().parse().unwrap())
                })
                .unwrap();
            while bytes.len() < body_start + length {
                let mut chunk = [0u8; 4096];
                let n = stream.read(&mut chunk).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&chunk[..n]);
            }
            let request: Value =
                serde_json::from_slice(&bytes[body_start..body_start + length]).unwrap();
            capture.lock().unwrap().push(request.clone());
            let mut data = match request["action"].as_str().unwrap() {
                "native_protocol" => {
                    json!({"protocol_version":1,"mode":"local","features":["session-authority-v1","native-action-allowlist-v1"]})
                }
                "bind_native_session" => request["inputs"].clone(),
                "status" => json!({"status":"ok","recent_events":[],"event_count":0}),
                _ => panic!("unexpected privileged action"),
            };
            if request["action"] == "native_protocol" {
                match fault {
                    "version" => data["protocol_version"] = json!(2),
                    "mode" => data["mode"] = json!("standalone"),
                    "features" => data["features"] = json!([]),
                    "unknown" => data["approved"] = json!(true),
                    _ => {}
                }
            }
            if fault == "ack" && request["action"] == "bind_native_session" {
                data["authority"]["workspace_id"] = json!("another-workspace");
            }
            let body = json!({"id":request["id"],"jsonrpc":"2.0","result":{"ok":true,"data":data}})
                .to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (port, requests, task)
}

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
    for fault in ["version", "mode", "features", "unknown"] {
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
