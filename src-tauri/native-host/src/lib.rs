//! Native-only startup/authentication protocol, independent of a webview runtime.
//! Only typed local status and scoped read data cross IPC; credentials never do.

mod authority;
pub mod command;
pub mod lifecycle;
pub mod mutation;
pub mod review;
#[cfg(test)]
mod review_tests;
pub mod workspace;

use authority::{Authority, Binding, Protocol};

use serde::{Deserialize, Serialize};
use std::{
    fmt,
    sync::atomic::{AtomicU64, Ordering},
    sync::Arc,
    sync::OnceLock,
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
    ProtocolIncompatible,
    WorkspaceBlocked,
    SelectionInvalid,
    PathInvalid,
    GrantDenied,
    FileNotFound,
    FileTooLarge,
    DirectoryTooLarge,
    TextUnsupported,
    ReadFailed,
    ProposalInvalid,
    ProposalTooLarge,
    ProposalCapacity,
    ProposalUnknown,
    ReviewDenied,
    WriteGrantRequired,
    FileConflict,
    OperationUnavailable,
    OperationReplayed,
    OutcomeUnknown,
    SandboxRequired,
    CommandInvalid,
    ShellUnavailable,
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
            Self::ProtocolIncompatible => "LOCAL_PROTOCOL_INCOMPATIBLE",
            Self::WorkspaceBlocked => "LOCAL_WORKSPACE_BLOCKED",
            Self::SelectionInvalid => "LOCAL_SELECTION_INVALID",
            Self::PathInvalid => "LOCAL_PATH_INVALID",
            Self::GrantDenied => "LOCAL_GRANT_DENIED",
            Self::FileNotFound => "LOCAL_FILE_NOT_FOUND",
            Self::FileTooLarge => "LOCAL_FILE_TOO_LARGE",
            Self::DirectoryTooLarge => "LOCAL_DIRECTORY_TOO_LARGE",
            Self::TextUnsupported => "LOCAL_TEXT_UNSUPPORTED",
            Self::ReadFailed => "LOCAL_READ_FAILED",
            Self::ProposalInvalid => "LOCAL_PROPOSAL_INVALID",
            Self::ProposalTooLarge => "LOCAL_PROPOSAL_TOO_LARGE",
            Self::ProposalCapacity => "LOCAL_PROPOSAL_CAPACITY",
            Self::ProposalUnknown => "LOCAL_PROPOSAL_UNAVAILABLE",
            Self::ReviewDenied => "LOCAL_REVIEW_DENIED",
            Self::WriteGrantRequired => "LOCAL_WRITE_GRANT_REQUIRED",
            Self::FileConflict => "LOCAL_FILE_CONFLICT",
            Self::OperationUnavailable => "LOCAL_OPERATION_UNAVAILABLE",
            Self::OperationReplayed => "LOCAL_OPERATION_REPLAYED",
            Self::OutcomeUnknown => "LOCAL_OUTCOME_UNKNOWN",
            Self::SandboxRequired => "LOCAL_SANDBOX_REQUIRED",
            Self::CommandInvalid => "LOCAL_COMMAND_INVALID",
            Self::ShellUnavailable => "LOCAL_SHELL_UNAVAILABLE",
        }
    }
    pub fn message(self) -> &'static str {
        match self {
            Self::Closed => "The local service is stopped.",
            Self::Busy => "The local service is busy. Try again shortly.",
            Self::WorkspaceBlocked => "Folder permissions could not be confirmed. Restart the local service before trying again.",
            Self::SelectionInvalid => "The selected folder is unavailable or unsupported. Select a local folder again.",
            Self::PathInvalid => "Use a relative path within the selected folder.",
            Self::GrantDenied => "This folder is not currently permitted. Select and confirm it again.",
            Self::FileNotFound => "The selected path no longer exists.",
            Self::FileTooLarge => "Text previews are limited to 256 KiB.",
            Self::DirectoryTooLarge => "This directory exceeds the entry or preview size limit.",
            Self::TextUnsupported => "Only UTF-8 text without NUL bytes can be previewed.",
            Self::ReadFailed => "The selected path could not be read securely.",
            Self::ProposalInvalid => "This operation proposal is invalid or unsupported.",
            Self::ProposalTooLarge => "The complete operation exceeds the review display limit.",
            Self::ProposalCapacity => "The native proposal or attempt limit has been reached.",
            Self::ProposalUnknown => "This proposal is unavailable in the current local session.",
            Self::ReviewDenied => "This review is denied, expired or no longer current.",
            Self::WriteGrantRequired => "Separately confirmed writable folder access is required.",
            Self::FileConflict => "The target changed or cannot meet the reviewed precondition. Prepare a new review.",
            Self::OperationUnavailable => "This operation is unavailable in the current local session.",
            Self::OperationReplayed => "This operation has already been attempted. Check its existing status.",
            Self::OutcomeUnknown => "The outcome could not be confirmed. Check the existing operation without retrying it.",
            Self::SandboxRequired => "A qualified execution sandbox is required. This command was not launched.",
            Self::CommandInvalid => "This command proposal is invalid or exceeds its limits.",
            Self::ShellUnavailable => "The selected executable or shell is unavailable. Choose an installed supported executable.",
            Self::StorageUnavailable => {
                "Local storage is unavailable. Check your device's storage permissions."
            }
            Self::ProtocolIncompatible => "The local service protocol is incompatible. Reinstall a matching desktop build.",
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
    #[serde(skip_serializing_if = "Option::is_none")]
    authority: Option<&'a Authority>,
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
    authority: OnceLock<Authority>,
    enrollment: tokio::sync::Mutex<()>,
    grants: Arc<tokio::sync::RwLock<workspace::GrantState>>,
    selection: tokio::sync::Mutex<()>,
    workspace_blocked: std::sync::atomic::AtomicBool,
    reviews: std::sync::Mutex<review::ReviewBook>,
    mutations: mutation::MutationBook,
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
            authority: OnceLock::new(),
            enrollment: tokio::sync::Mutex::new(()),
            grants: Arc::new(tokio::sync::RwLock::new(workspace::GrantState::default())),
            selection: tokio::sync::Mutex::new(()),
            workspace_blocked: std::sync::atomic::AtomicBool::new(false),
            reviews: std::sync::Mutex::new(review::ReviewBook::default()),
            mutations: mutation::MutationBook::default(),
        })
    }
    pub fn close(&self) {
        self.closed.send_replace(true);
        self.invalidate_reviews();
    }
    /// Trusted native startup only. There is no caller-supplied identity and
    /// no matching Tauri command. An ambiguous/failed bind closes this session.
    pub async fn bind_native(&self) -> Result<(), HostError> {
        let _enrollment = self.enrollment.try_lock().map_err(|_| HostError::Busy)?;
        let mut cancellation = self.closed.subscribe();
        if *cancellation.borrow() || self.authority.get().is_some() {
            return Err(HostError::Closed);
        }
        let result = tokio::select! {
            _ = cancellation.changed() => Err(HostError::Closed),
            result = self.bind_native_inner() => result,
        };
        if result.is_err() {
            self.close();
        }
        result
    }
    async fn bind_native_inner(&self) -> Result<(), HostError> {
        let protocol: Protocol = serde_json::from_value(self.request("native_protocol").await?)
            .map_err(|_| HostError::ProtocolIncompatible)?;
        if !protocol.compatible() {
            return Err(HostError::ProtocolIncompatible);
        }
        let authority = Authority::generate()?;
        let expected = Binding::new(authority.clone());
        let inputs = serde_json::to_value(&expected).map_err(|_| HostError::InvalidResponse)?;
        let acknowledged: Binding =
            serde_json::from_value(self.request_inputs("bind_native_session", inputs).await?)
                .map_err(|_| HostError::InvalidResponse)?;
        if acknowledged != expected {
            return Err(HostError::InvalidResponse);
        }
        self.authority
            .set(authority)
            .map_err(|_| HostError::StateUnavailable)
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
        self.close();
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
        self.request_inputs(action, serde_json::json!({})).await
    }
    async fn request_inputs(
        &self,
        action: &'static str,
        inputs: serde_json::Value,
    ) -> Result<serde_json::Value, HostError> {
        // Shutdown remains available even when grant state is uncertain.
        if action == "shutdown" {
            return self.request_authority(action, inputs, None).await;
        }
        let grants = self.grants.try_read().map_err(|_| HostError::Busy)?;
        if self.workspace_blocked.load(Ordering::Acquire) {
            return Err(HostError::WorkspaceBlocked);
        }
        let authority = self
            .authority
            .get()
            .map(|a| a.with_grant_revision(grants.revision));
        self.request_authority(action, inputs, authority.as_ref())
            .await
    }
    async fn request_authority(
        &self,
        action: &'static str,
        inputs: serde_json::Value,
        authority: Option<&Authority>,
    ) -> Result<serde_json::Value, HostError> {
        let id = format!(
            "native-status-{}",
            self.sequence.fetch_add(1, Ordering::Relaxed)
        );
        let body = StatusRequest {
            id: &id,
            jsonrpc: "2.0",
            auth_token: self.credential.child_env_value(),
            action,
            inputs,
            authority,
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
        if !result.ok {
            return Err(match result.code.as_deref() {
                Some("LOCAL_WORKSPACE_BLOCKED") => HostError::WorkspaceBlocked,
                Some("LOCAL_PATH_INVALID") => HostError::PathInvalid,
                Some("LOCAL_GRANT_DENIED") => HostError::GrantDenied,
                Some("LOCAL_FILE_NOT_FOUND") => HostError::FileNotFound,
                Some("LOCAL_FILE_TOO_LARGE") => HostError::FileTooLarge,
                Some("LOCAL_DIRECTORY_TOO_LARGE") => HostError::DirectoryTooLarge,
                Some("LOCAL_TEXT_UNSUPPORTED") => HostError::TextUnsupported,
                Some("LOCAL_READ_FAILED") => HostError::ReadFailed,
                Some("LOCAL_FILE_CONFLICT") => HostError::FileConflict,
                Some("LOCAL_WRITE_GRANT_REQUIRED") => HostError::WriteGrantRequired,
                Some("LOCAL_REVIEW_DENIED") => HostError::ReviewDenied,
                Some("LOCAL_OPERATION_REPLAYED") => HostError::OperationReplayed,
                Some("LOCAL_OPERATION_UNAVAILABLE") => HostError::OperationUnavailable,
                Some("LOCAL_PROPOSAL_UNAVAILABLE") => HostError::ProposalUnknown,
                Some("LOCAL_PROPOSAL_INVALID") => HostError::ProposalInvalid,
                Some("LOCAL_PROPOSAL_CAPACITY") => HostError::ProposalCapacity,
                Some("LOCAL_OPERATION_BUSY") => HostError::Busy,
                Some("LOCAL_SANDBOX_REQUIRED") => HostError::SandboxRequired,
                Some("LOCAL_COMMAND_INVALID") => HostError::CommandInvalid,
                Some("LOCAL_SHELL_UNAVAILABLE") => HostError::ShellUnavailable,
                _ => HostError::RpcRejected,
            });
        }
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
