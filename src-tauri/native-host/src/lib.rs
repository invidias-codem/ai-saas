//! Native-only startup/authentication protocol, independent of a webview runtime.
//! Only typed heartbeat data crosses the IPC boundary; credentials never do.

pub mod lifecycle;

use serde::{Deserialize, Serialize};
use std::{
    fmt,
    sync::atomic::{AtomicU64, Ordering},
    sync::Arc,
    time::Duration,
};
use tokio::sync::{watch, Semaphore};
use zeroize::Zeroizing;

pub const MAX_HANDSHAKE_BYTES: usize = 4096;
pub const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
pub const STARTUP_TIMEOUT: Duration = Duration::from_secs(7);
const RPC_TIMEOUT: Duration = Duration::from_millis(1500);

/// Do not pass service/provider secrets from a developer or hosted environment
/// into the native daemon. The launcher adds its fresh credential separately.
pub fn child_environment() -> Vec<(std::ffi::OsString, std::ffi::OsString)> {
    [
        "PATH",
        "SystemRoot",
        "WINDIR",
        "TMP",
        "TEMP",
        "TMPDIR",
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "LANG",
        "LC_ALL",
    ]
    .into_iter()
    .filter_map(|key| std::env::var_os(key).map(|value| (key.into(), value)))
    .collect()
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum HostError {
    RandomUnavailable,
    InvalidHandshake,
    HandshakeTooLarge,
    StartupTimeout,
    SpawnFailed,
    Exited,
    Closed,
    RpcTimeout,
    RpcUnavailable,
    InvalidResponse,
    ResponseTooLarge,
    RpcRejected,
    Busy,
    StorageUnavailable,
    StateUnavailable,
    CleanupUncertain,
}

impl HostError {
    pub fn code(self) -> &'static str {
        match self {
            Self::RandomUnavailable => "LOCAL_RANDOM_UNAVAILABLE",
            Self::InvalidHandshake => "LOCAL_HANDSHAKE_INVALID",
            Self::HandshakeTooLarge => "LOCAL_HANDSHAKE_TOO_LARGE",
            Self::StartupTimeout => "LOCAL_START_TIMEOUT",
            Self::SpawnFailed => "LOCAL_START_FAILED",
            Self::Exited => "LOCAL_SERVICE_EXITED",
            Self::Closed => "LOCAL_SERVICE_STOPPED",
            Self::RpcTimeout => "LOCAL_REQUEST_TIMEOUT",
            Self::RpcUnavailable => "LOCAL_SERVICE_UNAVAILABLE",
            Self::InvalidResponse => "LOCAL_RESPONSE_INVALID",
            Self::ResponseTooLarge => "LOCAL_RESPONSE_TOO_LARGE",
            Self::RpcRejected => "LOCAL_AUTH_REJECTED",
            Self::Busy => "LOCAL_SERVICE_BUSY",
            Self::StorageUnavailable => "LOCAL_STORAGE_UNAVAILABLE",
            Self::StateUnavailable => "LOCAL_STATE_UNAVAILABLE",
            Self::CleanupUncertain => "LOCAL_CLEANUP_UNCONFIRMED",
        }
    }
    pub fn message(self) -> &'static str {
        match self {
            Self::Closed => "The local service is stopped.",
            Self::Busy => "The local service is busy. Try again shortly.",
            Self::StorageUnavailable => {
                "Local storage is unavailable. Check your device's storage permissions."
            }
            Self::CleanupUncertain => "Local task cleanup could not be confirmed. Close Lattice OS and check running tasks before reopening.",
            _ => "The local service could not connect securely. Try restarting the local service.",
        }
    }
}

impl fmt::Display for HostError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.code())
    }
}
impl std::error::Error for HostError {}

// Intentionally neither Debug nor Serialize. This value belongs to Rust and
// the owned child environment, never frontend state, arguments, files or logs.
pub struct LaunchCredential(Zeroizing<String>);

impl LaunchCredential {
    pub fn generate() -> Result<Self, HostError> {
        let mut bytes = Zeroizing::new([0u8; 32]);
        getrandom::getrandom(bytes.as_mut()).map_err(|_| HostError::RandomUnavailable)?;
        let mut encoded = Zeroizing::new(String::with_capacity(64));
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for b in bytes.iter() {
            encoded.push(HEX[(b >> 4) as usize] as char);
            encoded.push(HEX[(b & 15) as usize] as char);
        }
        Ok(Self(encoded))
    }
    /// For the trusted process launcher only; never return this over IPC.
    pub fn child_env_value(&self) -> &str {
        &self.0
    }
}

#[derive(Default)]
pub struct StartupHandshake {
    bytes: Vec<u8>,
    completed: bool,
}

impl StartupHandshake {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Option<u16>, HostError> {
        if self.completed {
            return Err(HostError::InvalidHandshake);
        }
        if self.bytes.len().saturating_add(chunk.len()) > MAX_HANDSHAKE_BYTES {
            return Err(HostError::HandshakeTooLarge);
        }
        self.bytes.extend_from_slice(chunk);
        let Some(newline) = self.bytes.iter().position(|&b| b == b'\n') else {
            return Ok(None);
        };
        if self.bytes[newline + 1..]
            .iter()
            .any(|b| !b.is_ascii_whitespace())
        {
            return Err(HostError::InvalidHandshake);
        }
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Ready {
            status: String,
            port: u16,
        }
        let ready: Ready = serde_json::from_slice(&self.bytes[..newline])
            .map_err(|_| HostError::InvalidHandshake)?;
        if ready.status != "ready" || ready.port == 0 {
            return Err(HostError::InvalidHandshake);
        }
        self.completed = true;
        self.bytes.clear();
        Ok(Some(ready.port))
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TelemetryEvent {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    pub user_id: String,
    pub event_type: String,
    #[serde(default)]
    pub path_accessed: Option<String>,
    pub success: bool,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub operation_type: Option<String>,
    pub timestamp: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusData {
    status: String,
    #[serde(default)]
    recent_events: Option<Vec<TelemetryEvent>>,
    event_count: usize,
}

pub struct Status {
    pub events: Vec<TelemetryEvent>,
}

#[derive(Serialize)]
struct StatusRequest<'a> {
    id: &'a str,
    jsonrpc: &'static str,
    #[serde(rename = "authToken")]
    auth_token: &'a str,
    action: &'static str,
    inputs: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    id: String,
    jsonrpc: String,
    result: Option<DaemonResult>,
    error: Option<serde_json::Value>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DaemonResult {
    ok: bool,
    #[serde(default, rename = "output")]
    _output: Option<String>,
    error: Option<String>,
    code: Option<String>,
    data: Option<serde_json::Value>,
}

// No generic action/URL/token setter is exposed to the webview. The endpoint
// is constructed from a strictly parsed child port, with proxies/redirects off.
pub struct RpcSession {
    client: reqwest::Client,
    port: u16,
    credential: Arc<LaunchCredential>,
    sequence: AtomicU64,
    closed: watch::Sender<bool>,
    permits: Semaphore,
    shutdown_sent: std::sync::atomic::AtomicBool,
}

impl RpcSession {
    pub fn new(port: u16, credential: Arc<LaunchCredential>) -> Result<Self, HostError> {
        if port == 0 {
            return Err(HostError::InvalidHandshake);
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(1))
            .timeout(RPC_TIMEOUT)
            .build()
            .map_err(|_| HostError::RpcUnavailable)?;
        let (closed, _) = watch::channel(false);
        Ok(Self {
            client,
            port,
            credential,
            sequence: AtomicU64::new(0),
            closed,
            permits: Semaphore::new(4),
            shutdown_sent: std::sync::atomic::AtomicBool::new(false),
        })
    }
    pub fn close(&self) {
        self.closed.send_replace(true);
    }
    pub async fn status(&self) -> Result<Status, HostError> {
        let mut cancellation = self.closed.subscribe();
        if *cancellation.borrow() {
            return Err(HostError::Closed);
        }
        let _permit = self.permits.try_acquire().map_err(|_| HostError::Busy)?;
        tokio::select! {
            _ = cancellation.changed() => Err(HostError::Closed),
            result = tokio::time::timeout(RPC_TIMEOUT,self.send_status()) => {
                if *cancellation.borrow() { return Err(HostError::Closed); }
                result.map_err(|_|HostError::RpcTimeout)?
            }
        }
    }
    /// Native lifecycle control only. Closing heartbeats does not invalidate
    /// this one shutdown request; credentials never cross into the webview.
    pub async fn shutdown(&self) -> Result<(), HostError> {
        if self.shutdown_sent.swap(true, Ordering::AcqRel) {
            return Err(HostError::Closed);
        }
        let data = self.request("shutdown").await?;
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct ShutdownData {
            status: String,
        }
        let reply: ShutdownData =
            serde_json::from_value(data).map_err(|_| HostError::InvalidResponse)?;
        if reply.status != "stopping" {
            return Err(HostError::InvalidResponse);
        }
        Ok(())
    }
    async fn send_status(&self) -> Result<Status, HostError> {
        let data: StatusData = serde_json::from_value(self.request("status").await?)
            .map_err(|_| HostError::InvalidResponse)?;
        let events = data.recent_events.unwrap_or_default();
        if data.status != "ok" || data.event_count != events.len() || events.len() > 1000 {
            return Err(HostError::InvalidResponse);
        }
        Ok(Status { events })
    }
    async fn request(&self, action: &'static str) -> Result<serde_json::Value, HostError> {
        let id = format!(
            "native-status-{}",
            self.sequence.fetch_add(1, Ordering::Relaxed)
        );
        let body = StatusRequest {
            id: &id,
            jsonrpc: "2.0",
            auth_token: self.credential.child_env_value(),
            action,
            inputs: serde_json::json!({}),
        };
        let mut response = self
            .client
            .post(format!("http://127.0.0.1:{}/rpc", self.port))
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    HostError::RpcTimeout
                } else {
                    HostError::RpcUnavailable
                }
            })?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(HostError::RpcRejected);
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_RESPONSE_BYTES as u64)
        {
            return Err(HostError::ResponseTooLarge);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| HostError::RpcUnavailable)?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(HostError::ResponseTooLarge);
            }
            bytes.extend_from_slice(&chunk);
        }
        let reply: Envelope =
            serde_json::from_slice(&bytes).map_err(|_| HostError::InvalidResponse)?;
        if reply.id != id
            || reply.jsonrpc != "2.0"
            || (reply.result.is_some() == reply.error.is_some())
        {
            return Err(HostError::InvalidResponse);
        }
        let result = reply.result.ok_or(HostError::RpcRejected)?;
        if !result.ok
            || result.error.as_deref().is_some_and(|s| !s.is_empty())
            || result.code.as_deref().is_some_and(|s| !s.is_empty())
        {
            return Err(HostError::RpcRejected);
        }
        result.data.ok_or(HostError::InvalidResponse)
    }
}

impl Drop for RpcSession {
    fn drop(&mut self) {
        self.close();
    }
}

/// Privileged calls belong to the approved local main window. Development
/// origin is explicit and available only in debug builds at the Tauri adapter.
pub fn permits_window(label: &str, raw_url: &str, development: bool) -> bool {
    if label != "main" {
        return false;
    }
    let Ok(url) = reqwest::Url::parse(raw_url) else {
        return false;
    };
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) | ("http", Some("tauri.localhost"), None) => true,
        ("http", Some("localhost"), Some(3000)) => development,
        _ => false,
    }
}
