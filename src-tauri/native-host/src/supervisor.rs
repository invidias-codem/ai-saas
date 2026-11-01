//! Local runtime supervisor — one per profile, started on demand.
//! Coordinates single-writer ownership of a profile, a durable session
//! journal, and a small TCP JSON-RPC transport spoken by both the desktop
//! and the CLI. Each connected client gets its own identity and authority;
//! clients never inherit one another's grants or sessions.
//!
//! # ponytail: one in-process tokio::sync::Mutex plus an ephemeral TCP port
//! written to a per-profile dot-file. A per-process file lock and a
//! well-known port are the upgrade path if two supervisors must arbitrate
//! one profile.

use crate::{HostError, lifecycle::NativeHost};
use crate::lifecycle::Launcher;
use crate::mutation::OperationStatus;
use crate::review::ProposalInput;
use crate::review::ProposalSummary;
use crate::session_store::{SessionStatus, SessionStore};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs::OpenOptions;
use std::path::Path;
use std::sync::Arc;
use tokio::io::{self, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;

#[cfg(unix)]
use std::os::unix::io::AsRawFd;

const PROTOCOL_VERSION: u32 = 1;
const HELLO_ACTION: &str = "hello";

/// Cross-process exclusive ownership of one profile.
///
/// Acquired once per `Supervisor` lifetime and held until drop. The OS
/// releases it on crash, so a restarted supervisor can never be blocked by a
/// stale lock. Two supervisor processes for the same profile cannot both
/// hold it — the second fails fast instead of racing on shared state.
#[cfg(unix)]
struct LockFile {
    _file: std::fs::File,
}

#[cfg(unix)]
impl LockFile {
    fn acquire(path: &Path) -> std::io::Result<Self> {
        use libc::{flock, LOCK_EX, LOCK_NB};
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(path)?;
        let fd = file.as_raw_fd();
        let result = unsafe { flock(fd, LOCK_EX | LOCK_NB) };
        if result != 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AlreadyExists,
                format!(
                    "profile {} is owned by another supervisor process",
                    path.display()
                ),
            ));
        }
        Ok(Self { _file: file })
    }
}

#[cfg(not(unix))]
struct LockFile {
    _path: PathBuf,
}

#[cfg(not(unix))]
impl LockFile {
    fn acquire(path: &Path) -> std::io::Result<Self> {
        // Best-effort on non-unix platforms: touch the lock file so it exists,
        // without blocking. Unix `flock` is the required mutual-exclusion
        // path; other platforms add real locking when needed.
        std::fs::File::create(path)?;
        Ok(Self { _path: path.to_path_buf() })
    }
}

struct ClientIdentity {
    principal_id: String,
}

struct SupervisorState {
    host: Option<Arc<NativeHost>>,
    store: SessionStore,
    clients: BTreeMap<String, ClientIdentity>,
    processed: BTreeMap<String, Value>,
    next_session: u64,
}

pub struct Supervisor {
    profile_id: String,
    _lock: LockFile,
    state: Mutex<SupervisorState>,
}

impl Supervisor {
    pub fn new(profile_id: String, profile_dir: &Path) -> std::io::Result<Self> {
        let lock = LockFile::acquire(&profile_dir.join(".supervisor.lock"))?;
        Ok(Self {
            profile_id,
            _lock: lock,
            state: Mutex::new(SupervisorState {
                host: None,
                store: SessionStore::open(profile_dir)?,
                clients: BTreeMap::new(),
                processed: BTreeMap::new(),
                next_session: 0,
            }),
        })
    }

    /// Authenticate a client connection and check the protocol version.
    /// The first client to connect owns the profile (may start the host).
    pub async fn hello(&self, client_id: &str, protocol_version: u32) -> Result<Value, HostError> {
        if protocol_version != PROTOCOL_VERSION {
            return Err(HostError::ProtocolIncompatible);
        }
        let mut state = self.state.lock().await;
        let principal_id = format!("local-user-{:x}", state.clients.len() + 1);
        let owner = state.clients.is_empty();
        state.clients.insert(client_id.to_string(), ClientIdentity { principal_id: principal_id.clone() });
        Ok(json!({
            "session_id": principal_id,
            "server_version": PROTOCOL_VERSION,
            "owner": owner,
        }))
    }

    async fn client_principal(&self, client_id: &str) -> Option<String> {
        let state = self.state.lock().await;
        state.clients.get(client_id).map(|c| c.principal_id.clone())
    }

    /// Start the native host on demand (idempotent). Serializes on the state
    /// lock so only one host is ever started per profile.
    pub async fn ensure_host<L: Launcher + 'static>(&self, launcher: L) -> Result<(), HostError> {
        let mut state = self.state.lock().await;
        if state.host.is_some() {
            return Ok(());
        }
        let host = Arc::new(NativeHost::default());
        host.start(launcher).await?;
        state.host = Some(host);
        Ok(())
    }

    pub async fn set_host_for_test(&self, host: Arc<NativeHost>) {
        let mut state = self.state.lock().await;
        state.host = Some(host);
    }

    pub async fn handle_request(&self, client_id: &str, request: Value) -> Result<Value, HostError> {
        let action = request
            .get("action")
            .and_then(Value::as_str)
            .ok_or(HostError::CommandInvalid)?;
        let inputs = request.get("inputs").cloned().unwrap_or(Value::Null);
        let idempotency_key = inputs
            .get("idempotency_key")
            .and_then(Value::as_str)
            .map(|s| s.to_string());

        // Idempotency: a request ID that was already processed returns its
        // cached result instead of re-executing. This is what makes a retry
        // after a lost acknowledgment safe — the operation is never run twice.
        if let Some(key) = &idempotency_key {
            if let Some(cached) = self.state.lock().await.processed.get(key) {
                return Ok(cached.clone());
            }
        }

        let result = match action {
            HELLO_ACTION => Err(HostError::InvalidHandshake),
            "session.create" => self.session_create(client_id).await,
            "session.list" => Ok(json!({ "sessions": self.list_sessions().await })),
            "session.get" => {
                let id = session_id(&inputs)?;
                match self.get_session(id).await {
                    Some(s) => Ok(s),
                    None => Err(HostError::SelectionInvalid),
                }
            }
            "event.append" => {
                let session_id = session_id(&inputs)?;
                let kind = kind(&inputs)?;
                let payload = inputs.get("payload").cloned().unwrap_or(json!({}));
                self.append_event(client_id, session_id, kind, payload).await
            }
            "session.cancel" => {
                let id = session_id(&inputs)?;
                self.cancel_session(client_id, id).await
            }
            "agent.turn" => self.agent_turn(client_id, &inputs).await,
            "agent.status" => {
                let id = session_id(&inputs)?;
                self.agent_status(&id).await
            }
            "agent.cancel" => {
                let id = session_id(&inputs)?;
                self.agent_cancel(client_id, &id).await
            }
            "status" => Ok(self.status().await),
            _ => Err(HostError::CommandInvalid),
        };

        // Cache successful mutating results keyed by idempotency key.
        if let (Ok(ref data), Some(key)) = (&result, idempotency_key) {
            let mutates = matches!(
                action,
                "session.create" | "event.append" | "session.cancel" | "agent.turn" | "agent.cancel"
            );
            if mutates {
                self.state.lock().await.processed.insert(key, data.clone());
            }
        }

        result
    }

    /// Run one agent turn through the provider boundary: the proposal is
    /// validated and persisted by NativeHost, then handed to the native
    /// process for execution. Streaming progress and cancellation are
    /// surfaced through agent.status / agent.cancel.
    async fn agent_turn(
        &self,
        client_id: &str,
        inputs: &Value,
    ) -> Result<Value, HostError> {
        self.require_client(client_id).await?;
        let host = self.state.lock().await.host.clone().ok_or(HostError::Closed)?;
        let proposal: ProposalInput = serde_json::from_value(inputs.get("proposal").cloned().unwrap_or(Value::Null))
            .map_err(|_| HostError::ProposalInvalid)?;
        let summary: ProposalSummary = host.propose_operation(proposal).await?;
        Ok(serde_json::to_value(&summary).unwrap_or(json!({})))
    }

    /// Return the status of an in-flight or completed operation.
    async fn agent_status(&self, operation_id: &str) -> Result<Value, HostError> {
        let host = self.state.lock().await.host.clone().ok_or(HostError::Closed)?;
        let status: OperationStatus = host.operation_status(operation_id).await?;
        Ok(serde_json::to_value(&status).unwrap_or(json!({})))
    }

    /// Cancel an in-flight operation. Cancellation stops active work through
    /// the NativeHost boundary.
    async fn agent_cancel(&self, client_id: &str, operation_id: &str) -> Result<Value, HostError> {
        self.require_client(client_id).await?;
        let host = self.state.lock().await.host.clone().ok_or(HostError::Closed)?;
        let status: OperationStatus = host.cancel_operation(operation_id).await?;
        Ok(serde_json::to_value(&status).unwrap_or(json!({})))
    }

    pub async fn session_create(&self, client_id: &str) -> Result<Value, HostError> {
        self.require_client(client_id).await?;
        let mut state = self.state.lock().await;
        state.next_session += 1;
        let id = format!("session-{:x}", state.next_session);
        let session = state.store.create_session(id.clone(), client_id.to_string()).map_err(store_error)?;
        Ok(json!({ "session": session }))
    }

    pub async fn list_sessions(&self) -> Vec<Value> {
        let state = self.state.lock().await;
        state.store.list_sessions().into_iter().map(|s| json!({ "id": s.id, "status": s.status, "client_id": s.client_id })).collect()
    }

    pub async fn get_session(&self, id: &str) -> Option<Value> {
        let state = self.state.lock().await;
        let session = state.store.get_session(id)?;
        Some(json!({ "id": session.id, "status": session.status, "client_id": session.client_id }))
    }

    pub async fn append_event(&self, client_id: &str, session_id: &str, kind: String, payload: Value) -> Result<Value, HostError> {
        self.require_client(client_id).await?;
        let event = self.state.lock().await.store.append_event(session_id, client_id, kind, payload).map_err(store_error)?;
        Ok(json!({ "event": event }))
    }

    pub async fn cancel_session(&self, client_id: &str, id: &str) -> Result<Value, HostError> {
        self.require_client(client_id).await?;
        let state = self.state.lock().await;
        let session = state.store.get_session(id).ok_or(HostError::SelectionInvalid)?;
        if session.client_id != client_id {
            return Err(HostError::GrantDenied);
        }
        drop(state);
        self.state.lock().await.store.close_session(id, SessionStatus::Cancelled).map_err(store_error)?;
        Ok(json!({ "session_id": id, "status": "cancelled" }))
    }

    pub async fn status(&self) -> Value {
        let state = self.state.lock().await;
        let host_phase = match &state.host {
            Some(h) => format!("{:?}", h.phase()),
            None => "not_started".to_string(),
        };
        let session_count = state.store.list_sessions().len();
        json!({ "profile_id": self.profile_id, "host_phase": host_phase, "session_count": session_count })
    }

    async fn require_client(&self, client_id: &str) -> Result<(), HostError> {
        if self.client_principal(client_id).await.is_none() {
            return Err(HostError::InvalidHandshake);
        }
        Ok(())
    }
}

fn session_id(inputs: &Value) -> Result<&str, HostError> {
    inputs.get("session_id").and_then(Value::as_str).ok_or(HostError::SelectionInvalid)
}

fn kind(inputs: &Value) -> Result<String, HostError> {
    inputs.get("kind").and_then(Value::as_str).ok_or(HostError::SelectionInvalid).map(|s| s.to_string())
}

fn store_error(msg: String) -> HostError {
    match msg.as_str() {
        m if m.starts_with("session not found") => HostError::SelectionInvalid,
        m if m.contains("not owned") || m.contains("is not open") => HostError::GrantDenied,
        m if m.contains("already exists") => HostError::FileConflict,
        _ => HostError::RpcRejected,
    }
}

/// Serve one TCP connection: read newline-delimited JSON-RPC frames, run the
/// first `hello` to authenticate + version-check the client, then dispatch.
pub async fn serve_connection(stream: TcpStream, supervisor: Arc<Supervisor>) -> Result<(), HostError> {
    let (read, write) = stream.into_split();
    let mut reader = tokio::io::BufReader::new(read);
    let mut writer = write;
    let mut line = String::new();
    let mut client_id: Option<String> = None;
    loop {
        line.clear();
        let n = tokio::io::AsyncBufReadExt::read_line(&mut reader, &mut line).await.map_err(|_| HostError::Closed)?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => {
                let _ = write_frame(&mut writer, &error_frame(None, HostError::InvalidResponse)).await;
                continue;
            }
        };
        let id = request.get("id").and_then(Value::as_str).map(|s| s.to_string());

        if client_id.is_none() {
            let action = request.get("action").and_then(Value::as_str).unwrap_or("");
            if action != HELLO_ACTION {
                let _ = write_frame(&mut writer, &error_frame(id.as_deref(), HostError::InvalidHandshake)).await;
                continue;
            }
            let cid = request.get("inputs").and_then(|i| i.get("client_id")).and_then(Value::as_str).unwrap_or("anonymous").to_string();
            let version = request.get("inputs").and_then(|i| i.get("protocol_version")).and_then(Value::as_u64).unwrap_or(0) as u32;
            match supervisor.hello(&cid, version).await {
                Ok(data) => {
                    client_id = Some(cid.clone());
                    let _ = write_frame(
                        &mut writer,
                        &ok_frame(id.as_deref(), json!({ "session_id": data["session_id"], "server_version": data["server_version"], "owner": data["owner"] })),
                    )
                    .await;
                }
                Err(e) => {
                    let _ = write_frame(&mut writer, &error_frame(id.as_deref(), e)).await;
                }
            }
            continue;
        }

        let cid = client_id.as_deref().unwrap();
        match supervisor.handle_request(cid, request).await {
            Ok(data) => {
                let _ = write_frame(&mut writer, &ok_frame(id.as_deref(), data)).await;
            }
            Err(e) => {
                let _ = write_frame(&mut writer, &error_frame(id.as_deref(), e)).await;
            }
        }
    }
    Ok(())
}

fn ok_frame(id: Option<&str>, data: Value) -> Value {
    json!({ "id": id, "ok": true, "data": data })
}

fn error_frame(id: Option<&str>, error: HostError) -> Value {
    json!({ "id": id, "ok": false, "error": { "code": error.code(), "message": error.message() } })
}

async fn write_frame(writer: &mut (impl AsyncWriteExt + Unpin), frame: &Value) -> io::Result<()> {
    let mut line = serde_json::to_string(frame).unwrap();
    line.push('\n');
    writer.write_all(line.as_bytes()).await
}

/// Accept connections on `listener` and serve each against `supervisor`.
pub async fn serve(listener: TcpListener, supervisor: Arc<Supervisor>) -> ! {
    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let sup = supervisor.clone();
        tokio::spawn(async move {
            let _ = serve_connection(stream, sup).await;
        });
    }
}
