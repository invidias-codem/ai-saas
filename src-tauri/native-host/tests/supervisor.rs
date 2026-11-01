//! Supervisor + authenticated transport tests.
//! Exercises the new Slice 2 surface without the `lattice-harness` sidecar:
//! protocol handshake/version rejection, session create/list/cancel/append,
//! per-client isolation, durable journal replay, and supervisor idempotency.

use lattice_native_host::{
    lifecycle::{Launcher, NativeHost, ProcessControl, SpawnedProcess},
    session_store::{SessionStore, SessionStatus},
    supervisor::{serve, Supervisor},
    HostError, LaunchCredential,
};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tempfile::tempdir;
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

struct MockControl;
impl ProcessControl for MockControl {
    fn terminate(&self) {}
    fn release(&self) {}
}

struct MockLauncher {
    called: Arc<AtomicBool>,
}
impl Launcher for MockLauncher {
    fn spawn(&self, _credential: &LaunchCredential) -> Result<SpawnedProcess, HostError> {
        self.called.store(true, Ordering::SeqCst);
        let (_, rx) = mpsc::channel(1);
        Ok(SpawnedProcess { control: Arc::new(MockControl), events: rx })
    }
}

struct Client {
    writer: tokio::net::tcp::OwnedWriteHalf,
    reader: tokio::io::BufReader<tokio::net::tcp::OwnedReadHalf>,
}

impl Client {
    async fn connect(port: u16) -> Result<Self, String> {
        let stream = TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .map_err(|e| e.to_string())?;
        let (read, write) = stream.into_split();
        Ok(Self {
            writer: write,
            reader: tokio::io::BufReader::new(read),
        })
    }

    async fn send(&mut self, request: &Value) -> Result<Value, String> {
        let mut line = serde_json::to_string(request).unwrap();
        line.push('\n');
        self.writer
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        let mut resp = String::new();
        tokio::io::AsyncBufReadExt::read_line(&mut self.reader, &mut resp)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::from_str(resp.trim()).map_err(|e| e.to_string())
    }

    async fn hello(&mut self, client_id: &str, version: u32) -> Result<Value, String> {
        self.send(&json!({
            "id": "1",
            "action": "hello",
            "inputs": { "client_id": client_id, "protocol_version": version }
        }))
        .await
    }
}

async fn spawn_server(sup: Arc<Supervisor>) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let s = sup.clone();
    tokio::spawn(async move { serve(listener, s).await });
    // Give the acceptor a moment to be ready.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    port
}

#[tokio::test]
async fn hello_rejects_unknown_protocol_and_accepts_matching() {
    let dir = tempdir().unwrap();
    let sup = Arc::new(Supervisor::new("profile-1".to_string(), dir.path()).unwrap());
    let port = spawn_server(sup).await;

    let mut c = Client::connect(port).await.unwrap();
    let resp = c.hello("client-a", 9).await.unwrap();
    assert_eq!(resp.get("ok"), Some(&json!(false)));
    assert_eq!(
        resp.get("error").and_then(|e| e.get("code")).and_then(Value::as_str),
        Some("LOCAL_PROTOCOL_INCOMPATIBLE"),
        "unexpected: {resp:?}"
    );

    let mut c = Client::connect(port).await.unwrap();
    let data = c.hello("client-a", 1).await.unwrap();
    assert!(data.get("ok").and_then(Value::as_bool) == Some(true));
    let d = data.get("data").unwrap();
    assert!(d.get("session_id").is_some());
    assert_eq!(d.get("server_version"), Some(&json!(1)));
}

#[tokio::test]
async fn session_lifecycle_and_client_isolation() {
    let dir = tempdir().unwrap();
    let sup = Arc::new(Supervisor::new("profile-2".to_string(), dir.path()).unwrap());
    let port = spawn_server(sup.clone()).await;

    // Client A: hello + create session
    let mut a = Client::connect(port).await.unwrap();
    assert!(a.hello("client-a", 1).await.unwrap().get("ok").and_then(Value::as_bool) == Some(true));
    let created = a
        .send(&json!({ "id": "2", "action": "session.create", "inputs": {} }))
        .await
        .unwrap();
    assert!(created.get("ok").and_then(Value::as_bool) == Some(true));
    let session_id = created["data"]["session"]["id"].as_str().unwrap().to_string();

    // Client B: hello with a distinct identity, then tries to cancel A's session -> GrantDenied
    let mut b = Client::connect(port).await.unwrap();
    assert!(b.hello("client-b", 1).await.unwrap().get("ok").and_then(Value::as_bool) == Some(true));
    let cancel_b = b
        .send(&json!({ "id": "3", "action": "session.cancel", "inputs": { "session_id": &session_id } }))
        .await
        .unwrap();
    assert_eq!(
        cancel_b.get("error").and_then(|e| e.get("code")).and_then(Value::as_str),
        Some("LOCAL_GRANT_DENIED")
    );

    // Client A lists (sees its session), appends an event, then cancels
    let list = a
        .send(&json!({ "id": "4", "action": "session.list", "inputs": {} }))
        .await
        .unwrap();
    assert!(list.get("ok").and_then(Value::as_bool) == Some(true));
    assert!(list["data"]["sessions"].as_array().unwrap().len() >= 1);

    let appended = a
        .send(&json!({
            "id": "5",
            "action": "event.append",
            "inputs": { "session_id": &session_id, "kind": "turn", "payload": { "text": "hi" } }
        }))
        .await
        .unwrap();
    assert!(appended.get("ok").and_then(Value::as_bool) == Some(true));
    assert_eq!(appended["data"]["event"]["seq"], json!(0));

    let cancel_a = a
        .send(&json!({ "id": "6", "action": "session.cancel", "inputs": { "session_id": &session_id } }))
        .await
        .unwrap();
    assert!(cancel_a.get("ok").and_then(Value::as_bool) == Some(true));

    // The cancelled session is no longer open
    let got = a
        .send(&json!({ "id": "7", "action": "session.get", "inputs": { "session_id": &session_id } }))
        .await
        .unwrap();
    assert_eq!(got["data"]["status"], json!("Cancelled"));

    // Supervisor status reflects the session count
    let status = a
        .send(&json!({ "id": "8", "action": "status", "inputs": {} }))
        .await
        .unwrap();
    assert!(status.get("ok").and_then(Value::as_bool) == Some(true));
    assert_eq!(status["data"]["profile_id"], json!("profile-2"));
}

#[tokio::test]
async fn journal_replays_after_reopen_without_replaying_mutations() {
    let dir = tempdir().unwrap();
    {
        let store = SessionStore::open(dir.path()).unwrap();
        store.create_session("s-1".to_string(), "client-a".to_string()).unwrap();
        store
            .append_event("s-1", "client-a", "turn".to_string(), json!({ "k": "v" }))
            .unwrap();
        store.close_session("s-1", SessionStatus::Cancelled).unwrap();
    }
    // Reopen from the same directory: journal is the source of truth.
    let store = SessionStore::open(dir.path()).unwrap();
    let sessions = store.list_sessions();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, "s-1");
    assert_eq!(sessions[0].status, SessionStatus::Cancelled);
    let events = store.events_for_session("s-1");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, "turn");
    assert_eq!(events[0].payload, json!({ "k": "v" }));
    assert_eq!(events[0].seq, 0);
}

#[tokio::test]
async fn ensure_host_is_idempotent_and_does_not_restart() {
    let dir = tempdir().unwrap();
    let sup = Arc::new(Supervisor::new("profile-3".to_string(), dir.path()).unwrap());
    sup.set_host_for_test(Arc::new(NativeHost::default())).await;
    let called = Arc::new(AtomicBool::new(false));
    let mock = MockLauncher { called: called.clone() };
    let result = sup.ensure_host(mock).await;
    assert!(result.is_ok(), "{result:?}");
    assert!(
        !called.load(Ordering::SeqCst),
        "launcher must not be invoked when a host already owns the profile"
    );
}

#[tokio::test]
async fn unknown_action_is_rejected() {
    let dir = tempdir().unwrap();
    let sup = Arc::new(Supervisor::new("profile-4".to_string(), dir.path()).unwrap());
    let port = spawn_server(sup).await;
    let mut c = Client::connect(port).await.unwrap();
    assert!(c.hello("client-a", 1).await.unwrap().get("ok").and_then(Value::as_bool) == Some(true));
    let resp = c
        .send(&json!({ "id": "9", "action": "no.such.action", "inputs": {} }))
        .await
        .unwrap();
    assert_eq!(
        resp.get("error").and_then(|e| e.get("code")).and_then(Value::as_str),
        Some("LOCAL_COMMAND_INVALID")
    );
}

#[tokio::test]
async fn competing_processes_cannot_own_same_profile() {
    let dir = tempdir().unwrap();
    let _first = Supervisor::new("profile-compete".to_string(), dir.path()).unwrap();
    // A second supervisor for the same profile dir must fail fast — the OS
    // lock is held by the first and released only on drop (or crash).
    let second = Supervisor::new("profile-compete".to_string(), dir.path());
    match second {
        Err(e) => assert_eq!(e.kind(), std::io::ErrorKind::AlreadyExists),
        Ok(_) => panic!("second supervisor must not acquire the profile lock"),
    }
}

#[tokio::test]
async fn torn_trailing_line_is_skipped_on_replay() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("sessions.jsonl");
    // Write one valid session entry followed by a torn (partial) line.
    std::fs::write(
        &path,
        r#"{"Session":{"id":"s-1","client_id":"client-a","status":"Open","created_at":"1","closed_at":null}}
{"Session":{"id":"s-2"#,
    )
    .unwrap();
    let store = SessionStore::open(dir.path()).unwrap();
    let sessions = store.list_sessions();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, "s-1");
}

#[tokio::test]
async fn idempotent_retry_returns_cached_result() {
    let dir = tempdir().unwrap();
    let sup = Arc::new(Supervisor::new("profile-idem".to_string(), dir.path()).unwrap());
    let port = spawn_server(sup.clone()).await;

    let mut c = Client::connect(port).await.unwrap();
    assert!(c.hello("client-a", 1).await.unwrap().get("ok").and_then(Value::as_bool) == Some(true));

    let request = json!({
        "id": "1",
        "action": "session.create",
        "inputs": { "idempotency_key": "turn-42" }
    });
    let first = c.send(&request).await.unwrap();
    assert!(first.get("ok").and_then(Value::as_bool) == Some(true));
    let session_id = first["data"]["session"]["id"].as_str().unwrap().to_string();

    // Retry with the same idempotency key — must return the cached result,
    // not create a second session.
    let retry = c.send(&request).await.unwrap();
    assert!(retry.get("ok").and_then(Value::as_bool) == Some(true));
    assert_eq!(retry["data"]["session"]["id"], json!(session_id));

    // The profile still has exactly one session.
    let list = c
        .send(&json!({ "id": "2", "action": "session.list", "inputs": {} }))
        .await
        .unwrap();
    assert_eq!(list["data"]["sessions"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn agent_turn_requires_started_host() {
    let dir = tempdir().unwrap();
    let sup = Arc::new(Supervisor::new("profile-turn".to_string(), dir.path()).unwrap());
    let port = spawn_server(sup.clone()).await;

    let mut c = Client::connect(port).await.unwrap();
    assert!(c.hello("client-a", 1).await.unwrap().get("ok").and_then(Value::as_bool) == Some(true));

    // No host has been started — agent.turn must surface Closed, not panic.
    let resp = c
        .send(&json!({
            "id": "3",
            "action": "agent.turn",
            "inputs": {
                "idempotency_key": "turn-1",
                "proposal": { "kind": "create_file", "grant_id": "g-1", "relative_path": "a.txt", "content": "hi" }
            }
        }))
        .await
        .unwrap();
    assert_eq!(
        resp.get("error").and_then(|e| e.get("code")).and_then(Value::as_str),
        Some("LOCAL_SERVICE_STOPPED")
    );
}
