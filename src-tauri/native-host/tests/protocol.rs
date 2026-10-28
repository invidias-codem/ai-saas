use lattice_native_host::{
    permits_window, HostError, LaunchCredential, RpcSession, StartupHandshake, MAX_HANDSHAKE_BYTES,
    MAX_RESPONSE_BYTES,
};
use std::sync::Arc;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

#[test]
fn launch_credentials_use_fresh_os_randomness() {
    let a = LaunchCredential::generate().expect("OS randomness");
    let b = LaunchCredential::generate().expect("OS randomness");
    assert_eq!(a.child_env_value().len(), 64);
    assert!(a.child_env_value().bytes().all(|b| b.is_ascii_hexdigit()));
    assert!(
        a.child_env_value() != b.child_env_value(),
        "a new launch must rotate credentials"
    );
}

#[test]
fn startup_requires_one_complete_bounded_frame() {
    let mut frame = StartupHandshake::default();
    assert_eq!(frame.push(br#"{"status":"rea"#).unwrap(), None);
    assert_eq!(frame.push(b"dy\",\"port\":44123}\n").unwrap(), Some(44123));
    assert_eq!(frame.push(b"{}\n"), Err(HostError::InvalidHandshake));
    assert_eq!(
        StartupHandshake::default().push(&vec![b'x'; MAX_HANDSHAKE_BYTES + 1]),
        Err(HostError::HandshakeTooLarge)
    );
}

#[test]
fn invalid_startup_never_produces_a_port() {
    for bytes in [
        b"not json\n".as_slice(),
        b"{\"status\":\"ready\",\"port\":0}\n",
        b"{\"status\":\"ready\",\"port\":65536}\n",
        b"{\"status\":\"ready\",\"port\":1.5}\n",
        b"{\"status\":\"ready\",\"port\":\"5000\"}\n",
        b"{\"status\":\"error\",\"port\":5000}\n",
        b"{\"status\":\"ready\",\"port\":5000,\"credential\":\"never expose\"}\n",
        b"{\"status\":\"ready\",\"port\":5000}\n{}\n",
    ] {
        assert!(StartupHandshake::default().push(bytes).is_err());
    }
}

#[test]
fn ipc_accepts_only_the_approved_local_main_window() {
    for url in ["tauri://localhost/", "http://tauri.localhost/index.html"] {
        assert!(permits_window("main", url, false));
    }
    assert!(permits_window("main", "http://localhost:3000/", true));
    for (label, url, development) in [
        ("other", "tauri://localhost/", false),
        ("main", "https://gen1e.xyz/", false),
        ("main", "http://localhost:3000/", false),
        ("main", "http://localhost:3001/", true),
        ("main", "https://tauri.localhost.evil/", false),
        ("main", "http://attacker@tauri.localhost/", false),
    ] {
        assert!(!permits_window(label, url, development));
    }
}

async fn request_body(stream: &mut tokio::net::TcpStream) -> serde_json::Value {
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 2048];
    loop {
        let n = stream.read(&mut chunk).await.unwrap();
        assert!(n > 0 && bytes.len() < 16384, "bounded test request");
        bytes.extend_from_slice(&chunk[..n]);
        if let Some(header_end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..header_end]).to_lowercase();
            let length: usize = headers
                .lines()
                .find_map(|line| line.strip_prefix("content-length: "))
                .unwrap()
                .parse()
                .unwrap();
            if bytes.len() >= header_end + 4 + length {
                return serde_json::from_slice(&bytes[header_end + 4..header_end + 4 + length])
                    .unwrap();
            }
        }
    }
}

async fn fixture(
    reply: impl FnOnce(serde_json::Value) -> String + Send + 'static,
) -> (RpcSession, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let credential = Arc::new(LaunchCredential::generate().unwrap());
    let expected = credential.child_env_value().to_owned();
    let session = RpcSession::new(listener.local_addr().unwrap().port(), credential).unwrap();
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let request = request_body(&mut stream).await;
        assert!(
            request["authToken"].as_str() == Some(expected.as_str()),
            "launch credential must be injected natively"
        );
        assert_eq!(request["action"], "status");
        let response = reply(request);
        let wire = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            response.len(),
            response
        );
        let _ = stream.write_all(wire.as_bytes()).await;
    });
    (session, task)
}

fn success(id: serde_json::Value) -> String {
    serde_json::json!({"id":id,"jsonrpc":"2.0","result":{"ok":true,"output":"status ok","data":{"status":"ok","recent_events":null,"event_count":0}}}).to_string()
}

#[tokio::test]
async fn ready_requires_an_authenticated_matching_status_reply() {
    let (session, server) = fixture(|request| success(request["id"].clone())).await;
    assert!(session.status().await.unwrap().events.is_empty());
    server.await.unwrap();
}

#[tokio::test]
async fn stale_ids_rejected_even_when_server_claims_success() {
    let (session, server) = fixture(|_| success(serde_json::json!("stale-id"))).await;
    assert!(matches!(
        session.status().await,
        Err(HostError::InvalidResponse)
    ));
    server.await.unwrap();
}

#[tokio::test]
async fn jsonrpc_auth_errors_never_become_ready_or_echo_server_text() {
    let (session, server) = fixture(|request| {
        serde_json::json!({
            "id": request["id"], "jsonrpc": "2.0",
            "error": { "code": -32000, "message": "untrusted server text" }
        })
        .to_string()
    })
    .await;
    let error = session.status().await.err().unwrap();
    assert_eq!(error, HostError::RpcRejected);
    assert!(!error.message().contains("untrusted"));
    server.await.unwrap();
}

#[tokio::test]
async fn response_with_result_and_error_is_invalid() {
    let (session, server) = fixture(|request| {
        serde_json::json!({
            "id": request["id"], "jsonrpc": "2.0",
            "result": { "ok": true }, "error": { "code": 0 }
        })
        .to_string()
    })
    .await;
    assert!(matches!(
        session.status().await,
        Err(HostError::InvalidResponse)
    ));
    server.await.unwrap();
}

#[tokio::test]
async fn oversized_response_cannot_be_buffered() {
    let (session, server) = fixture(|_| "x".repeat(MAX_RESPONSE_BYTES + 1)).await;
    assert!(matches!(
        session.status().await,
        Err(HostError::ResponseTooLarge)
    ));
    server.await.unwrap();
}

#[tokio::test]
async fn closing_cancels_an_inflight_heartbeat() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let session = Arc::new(
        RpcSession::new(
            listener.local_addr().unwrap().port(),
            Arc::new(LaunchCredential::generate().unwrap()),
        )
        .unwrap(),
    );
    let caller = session.clone();
    let pending = tokio::spawn(async move { caller.status().await });
    let (_connection, _) = listener.accept().await.unwrap();
    session.close();
    assert!(matches!(pending.await.unwrap(), Err(HostError::Closed)));
    assert!(matches!(session.status().await, Err(HostError::Closed)));
}

#[tokio::test]
async fn a_stalled_server_has_a_deadline() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let session = RpcSession::new(
        listener.local_addr().unwrap().port(),
        Arc::new(LaunchCredential::generate().unwrap()),
    )
    .unwrap();
    let pending = tokio::spawn(async move { session.status().await });
    let (_connection, _) = listener.accept().await.unwrap();
    assert!(matches!(pending.await.unwrap(), Err(HostError::RpcTimeout)));
}
