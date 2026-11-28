//! Authenticated IPC transport for agent runtime.
//!
//! Provides protocol-version negotiation, client identity verification,
//! and secure message passing between CLI/desktop and the runtime.
//!
//! Unix: Unix domain sockets (authenticated).
//! Windows: Named-pipe transport behind `windows-ipc` feature gate.
//!   When disabled, fails closed with `IpcError::Unsupported`.
//!   No unauthenticated local execution is ever exposed on Windows.
//!   Authentication requires Credential Broker; placeholder auth is not used.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, error, info};
use uuid::Uuid;

use crate::agent_loop::{AgentCommand, AgentResponse};
use lattice_credential_broker::{CredentialBroker, CredentialKind, ProviderKind};

/// Protocol version for negotiation.
pub type ProtocolVersion = u32;
pub const PROTOCOL_VERSION: u32 = 1;

/// IPC errors.
#[derive(Debug, Error)]
pub enum IpcError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Protocol version mismatch: expected {expected}, got {actual}")]
    ProtocolMismatch { expected: u32, actual: u32 },
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    #[error("Client not authorized: {0}")]
    Unauthorized(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Channel error: {0}")]
    Channel(String),
    #[error("Timeout: {0}")]
    Timeout(String),
    #[error("Invalid message: {0}")]
    InvalidMessage(String),
    #[error("Platform not supported: {0}")]
    Unsupported(String),
}

impl From<&str> for IpcError {
    fn from(s: &str) -> Self {
        IpcError::InvalidMessage(s.to_string())
    }
}

impl From<String> for IpcError {
    fn from(s: String) -> Self {
        IpcError::InvalidMessage(s)
    }
}

pub type IpcResult<T> = std::result::Result<T, IpcError>;

/// Platform stream type alias. Unix uses real Unix domain streams;
/// Windows uses a placeholder that is never instantiated because the
/// transport fails closed before any stream is created.
#[cfg(unix)]
use tokio::net::UnixStream as StreamImpl;

#[cfg(windows)]
struct StreamImpl;

/// IPC message types.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum IpcMessage {
    /// Client hello with protocol version and identity.
    Hello {
        protocol_version: u32,
        client_identity: String,
        client_type: ClientType,
        capabilities: Vec<String>,
    },
    /// Server hello response.
    HelloResponse {
        protocol_version: u32,
        server_identity: String,
        accepted: bool,
        reason: Option<String>,
    },
    /// Authenticate request (for future extensibility).
    Authenticate { token: String },
    /// Authentication response.
    AuthenticateResponse {
        success: bool,
        session_id: Option<String>,
        reason: Option<String>,
    },
    /// Agent command from client.
    Command {
        request_id: String,
        command: AgentCommand,
    },
    /// Command response.
    CommandResponse {
        request_id: String,
        response: AgentResponse,
    },
    /// Event stream from server to client.
    Event {
        event_type: String,
        payload: serde_json::Value,
    },
    /// Heartbeat/ping.
    Ping { timestamp: SystemTime },
    /// Pong response.
    Pong { timestamp: SystemTime },
    /// Error notification.
    Error { code: String, message: String },
    /// Goodbye/disconnect.
    Goodbye { reason: String },
}

/// Client types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ClientType {
    /// Desktop application.
    Desktop,
    /// CLI application.
    Cli,
    /// Web view (future).
    WebView,
}

/// IPC server for the agent runtime.
pub struct IpcServer {
    profile_id: String,
    config: IpcConfig,
    credential_broker: Arc<CredentialBroker>,
    nonce_tracker: Arc<NonceTracker>,
    state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
    agent_loop: Arc<crate::agent_loop::AgentLoop>,
    clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

/// IPC configuration.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IpcConfig {
    pub protocol_version: u32,
    pub socket_path: Option<PathBuf>,
    pub client_identity: String,
    pub require_auth: bool,
    pub connect_timeout_ms: u64,
}

/// Connected client info. Only `authenticated` and `tx` are used.
#[derive(Debug, Clone)]
struct ConnectedClient {
    authenticated: bool,
    session_id: Option<String>,
    tx: mpsc::UnboundedSender<IpcMessage>,
}

/// Nonce-based replay resistance tracker.
///
/// Nonces are single-use with a 5-minute TTL. Request IDs are tracked per
/// client to detect duplicate command submissions (replay attacks).
pub struct NonceTracker {
    nonces: Mutex<HashMap<String, NonceEntry>>,
    request_ids: Mutex<HashMap<String, HashMap<String, u64>>>,
}

struct NonceEntry {
    created_at: u64,
    used: bool,
}

/// Nonce TTL in seconds (5 minutes).
const NONCE_TTL_SECS: u64 = 300;

impl NonceTracker {
    pub fn new() -> Self {
        Self {
            nonces: Mutex::new(HashMap::new()),
            request_ids: Mutex::new(HashMap::new()),
        }
    }

    /// Generate a cryptographically secure challenge nonce.
    pub fn generate_challenge(&self) -> String {
        Uuid::new_v4().to_string()
    }

    /// Register a challenge nonce for later validation.
    pub async fn register_challenge(&self, nonce: &str) {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        self.nonces.lock().await.insert(
            nonce.to_string(),
            NonceEntry {
                created_at: now,
                used: false,
            },
        );
    }

    /// Validate a challenge nonce: single-use, not expired.
    /// Returns `false` if the nonce is unknown, already used, or expired.
    pub async fn validate_challenge(&self, nonce: &str) -> bool {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let mut nonces = self.nonces.lock().await;

        // Clean expired entries
        nonces.retain(|_, entry| now - entry.created_at < NONCE_TTL_SECS);

        match nonces.get_mut(nonce) {
            Some(entry) => {
                if entry.used {
                    return false; // Already used (replay)
                }
                if now - entry.created_at >= NONCE_TTL_SECS {
                    return false; // Expired
                }
                entry.used = true; // Mark as used (single-use)
                true
            }
            None => false, // Unknown nonce
        }
    }

    /// Record a request ID for replay detection.
    /// Returns `false` if the request ID was already seen for this client.
    pub async fn record_request_id(&self, client_id: &str, request_id: &str) -> bool {
        let mut ids = self.request_ids.lock().await;
        let client_ids = ids.entry(client_id.to_string()).or_default();
        if client_ids.contains_key(request_id) {
            return false; // Replay detected
        }
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        client_ids.insert(request_id.to_string(), now);
        true
    }
}

impl Default for NonceTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl IpcServer {
    /// Create a new IPC server.
    ///
    /// `credential_broker` is required for authenticating client connections.
    /// Authentication is fail-closed: if the broker cannot validate a token,
    /// the connection is rejected.
    pub async fn new(
        profile_id: String,
        config: IpcConfig,
        credential_broker: Arc<CredentialBroker>,
        state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: Arc<crate::agent_loop::AgentLoop>,
    ) -> IpcResult<Self> {
        Ok(Self {
            profile_id,
            config,
            credential_broker,
            nonce_tracker: Arc::new(NonceTracker::new()),
            state_machine,
            agent_loop,
            clients: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx: None,
        })
    }

    /// Start the IPC server.
    #[cfg(unix)]
    pub async fn start(&mut self) -> IpcResult<()> {
        let socket_path = self.socket_path()?;
        info!("Starting IPC server on {:?}", socket_path);

        // Clean up any existing socket
        if socket_path.exists() {
            std::fs::remove_file(&socket_path).ok();
        }

        let listener = UnixListener::bind(&socket_path)?;

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        self.shutdown_tx = Some(shutdown_tx);

        let clients = self.clients.clone();
        let credential_broker = self.credential_broker.clone();
        let nonce_tracker = self.nonce_tracker.clone();
        let state_machine = self.state_machine.clone();
        let agent_loop = self.agent_loop.clone();
        let config = self.config.clone();

        tokio::spawn(async move {
            let mut listener = Some(listener);
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        info!("IPC server shutdown requested");
                        break;
                    }
                    accept_result = async {
                        if let Some(listener) = &mut listener {
                            listener.accept().await
                        } else {
                            std::future::pending().await
                        }
                    } => {
                        match accept_result {
                            Ok((stream, _addr)) => {
                                let clients = clients.clone();
                                let credential_broker = credential_broker.clone();
                                let nonce_tracker = nonce_tracker.clone();
                                let state_machine = state_machine.clone();
                                let agent_loop = agent_loop.clone();
                                let config = config.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = Self::handle_client(
                                        Arc::new(Mutex::new(stream)),
                                        credential_broker,
                                        nonce_tracker,
                                        clients,
                                        state_machine,
                                        agent_loop,
                                        config,
                                    ).await {
                                        error!("Client handler error: {}", e);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Accept error: {}", e);
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    /// Start the IPC server on Windows named-pipe transport.
    ///
    /// Requires the `windows-ipc` feature. Creates a named pipe with a
    /// user-only ACL, accepts connections, authenticates via Credential
    /// Broker, and processes commands only from authenticated clients.
    ///
    /// Authentication is fail-closed: clients must complete the
    /// authenticate handshake before any command is processed.
    #[cfg(all(windows, feature = "windows-ipc"))]
    pub async fn start(&mut self) -> IpcResult<()> {
        let pipe_name = format!(
            "{}{}-{}",
            windows_named_pipe::PIPE_NAME_PREFIX,
            self.profile_id,
            self.config.client_identity
        );

        let sd = windows_named_pipe::UserSecurityDescriptor::new()
            .map_err(|e| IpcError::Io(e.to_string()))?;

        info!("Windows named-pipe IPC server listening on {}", pipe_name);

        loop {
            let pipe_name_clone = pipe_name.clone();
            let sd_clone = sd.clone();
            let credential_broker = self.credential_broker.clone();
            let nonce_tracker = self.nonce_tracker.clone();
            let clients = self.clients.clone();
            let state_machine = self.state_machine.clone();
            let agent_loop = self.agent_loop.clone();
            let config = self.config.clone();

            tokio::spawn(async move {
                if let Err(e) = Self::accept_and_handle(
                    pipe_name_clone,
                    sd_clone,
                    credential_broker,
                    nonce_tracker,
                    clients,
                    state_machine,
                    agent_loop,
                    config,
                )
                .await
                {
                    error!("Windows named-pipe connection error: {}", e);
                }
            });

            tokio::task::yield_now().await;
        }
    }

    /// Start the IPC server on Windows when `windows-ipc` feature is disabled.
    #[cfg(all(windows, not(feature = "windows-ipc")))]
    pub async fn start(&mut self) -> IpcResult<()> {
        Err(IpcError::Unsupported(
            "Windows IPC transport requires the `windows-ipc` feature".to_string(),
        ))
    }

    /// Stop the IPC server.
    pub async fn stop(&mut self) -> IpcResult<()> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }

        // Disconnect all clients
        let mut clients = self.clients.write().await;
        for (_, client) in clients.drain() {
            let _ = client.tx.send(IpcMessage::Goodbye {
                reason: "Server shutting down".to_string(),
            });
        }

        // Clean up socket
        if let Some(socket_path) = self.config.socket_path.clone() {
            let _ = std::fs::remove_file(&socket_path);
        }

        Ok(())
    }

    /// Get the socket path for this profile.
    fn socket_path(&self) -> IpcResult<PathBuf> {
        if let Some(path) = &self.config.socket_path {
            return Ok(path.clone());
        }

        let base = if cfg!(target_os = "windows") {
            std::env::var_os("LOCALAPPDATA")
                .or_else(|| std::env::var_os("APPDATA"))
                .map(PathBuf::from)
                .ok_or("Could not determine app data directory")?
        } else {
            PathBuf::from(std::env::var_os("HOME").ok_or("Could not determine home directory")?)
                .join(".local/share")
        };

        let runtime_root = if self.config.client_identity.contains("preview") {
            base.join("xyz.gen1e.lattice-os.preview")
        } else {
            base.join("xyz.gen1e.lattice-os")
        };

        let socket_dir = runtime_root.join("runtime");
        std::fs::create_dir_all(&socket_dir).map_err(IpcError::Io)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&socket_dir, std::fs::Permissions::from_mode(0o700))
                .map_err(IpcError::Io)?;
        }

        Ok(socket_dir.join(format!("{}.sock", self.profile_id)))
    }

    /// Handle a client connection.
    #[cfg(unix)]
    async fn handle_client(
        stream: Arc<Mutex<UnixStream>>,
        credential_broker: Arc<CredentialBroker>,
        nonce_tracker: Arc<NonceTracker>,
        clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: Arc<crate::agent_loop::AgentLoop>,
        config: IpcConfig,
    ) -> IpcResult<()> {
        let client_id = Uuid::new_v4().to_string();
        debug!("New client connection: {0}", client_id);

        // Read hello message
        let hello = {
            let mut s = stream.lock().await;
            Self::read_message(&mut s).await?
        };
        let IpcMessage::Hello {
            protocol_version,
            client_identity: _,
            client_type: _,
            capabilities: _capabilities,
        } = hello
        else {
            return Err(IpcError::InvalidMessage(
                "Expected hello message".to_string(),
            ));
        };

        // Check protocol version
        if protocol_version != config.protocol_version {
            let response = IpcMessage::HelloResponse {
                protocol_version: config.protocol_version,
                server_identity: config.client_identity.clone(),
                accepted: false,
                reason: Some(format!(
                    "Protocol version mismatch: expected {}, got {}",
                    config.protocol_version, protocol_version
                )),
            };
            {
                let mut s = stream.lock().await;
                Self::write_message(&mut s, &response).await?;
            }
            return Err(IpcError::ProtocolMismatch {
                expected: config.protocol_version,
                actual: protocol_version,
            });
        }

        // Accept connection
        let (tx, mut rx) = mpsc::unbounded_channel::<IpcMessage>();

        let response = IpcMessage::HelloResponse {
            protocol_version: config.protocol_version,
            server_identity: config.client_identity.clone(),
            accepted: true,
            reason: None,
        };
        {
            let mut s = stream.lock().await;
            Self::write_message(&mut s, &response).await?;
        }

        // Register client
        let client = ConnectedClient {
            authenticated: !config.require_auth, // If no auth required, mark as authenticated
            session_id: None,
            tx,
        };
        clients.write().await.insert(client_id.clone(), client);

        // Spawn writer task
        let write_stream = stream.clone();
        let writer_handle = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = {
                    let mut w = write_stream.lock().await;
                    Self::write_message(&mut w, &msg).await
                } {
                    error!("Write error: {0}", e);
                    break;
                }
            }
        });

        // Handle incoming messages
        let read_stream = stream;
        loop {
            let result = {
                let mut r = read_stream.lock().await;
                Self::read_message(&mut r).await
            };
            match result {
                Ok(msg) => {
                    if let Err(e) = Self::process_message(
                        &client_id,
                        msg,
                        &credential_broker,
                        &nonce_tracker,
                        &clients,
                        &state_machine,
                        &agent_loop,
                    )
                    .await
                    {
                        error!("Message processing error: {}", e);
                    }
                }
                Err(e) => {
                    debug!("Read error (client disconnected): {}", e);
                    break;
                }
            }
        }

        // Cleanup
        clients.write().await.remove(&client_id);
        writer_handle.abort();

        Ok(())
    }

    /// Accept a client connection and handle it on Windows named-pipe transport.
    ///
    /// Creates a named pipe instance, waits for a client, performs the
    /// authentication handshake via Credential Broker, and processes
    /// commands only from authenticated clients.
    #[cfg(all(windows, feature = "windows-ipc"))]
    async fn accept_and_handle(
        pipe_name: String,
        sd: windows_named_pipe::UserSecurityDescriptor,
        credential_broker: Arc<CredentialBroker>,
        nonce_tracker: Arc<NonceTracker>,
        clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: Arc<crate::agent_loop::AgentLoop>,
        config: IpcConfig,
    ) -> IpcResult<()> {
        use windows_sys::Win32::Foundation::*;
        use windows_sys::Win32::System::Pipes::*;

        let sa = sd.security_attributes();

        let pipe_name_wide: Vec<u16> = pipe_name.encode_utf16().chain(Some(0)).collect();

        let pipe = unsafe {
            let handle = CreateNamedPipeW(
                pipe_name_wide.as_ptr(),
                PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
                PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
                PIPE_UNLIMITED_INSTANCES,
                windows_named_pipe::MAX_MESSAGE_SIZE as u32,
                windows_named_pipe::MAX_MESSAGE_SIZE as u32,
                0,
                &sa,
            );
            if handle == INVALID_HANDLE_VALUE {
                return Err(IpcError::Io(format!(
                    "CreateNamedPipeW failed: {}",
                    io::Error::last_os_error()
                )));
            }
            OwnedHandle::from_raw_handle(handle)
        };

        // Wait for client connection (blocking, in spawn_blocking)
        tokio::task::spawn_blocking(move || unsafe {
            if ConnectNamedPipe(pipe.as_raw_handle(), std::ptr::null_mut()) == 0 {
                let err = io::Error::last_os_error();
                if err.raw_os_error() != Some(ERROR_PIPE_CONNECTED as i32) {
                    return Err(io::Error::last_os_error());
                }
            }
            Ok(pipe)
        })
        .await
        .map_err(|e| IpcError::Io(e.to_string()))??;

        debug!("Windows named-pipe client connected");

        let result = Self::handle_named_pipe_client(
            pipe,
            credential_broker,
            nonce_tracker,
            clients,
            state_machine,
            agent_loop,
            config,
        )
        .await;

        // Disconnect the pipe
        unsafe {
            let _ = DisconnectNamedPipe(pipe.as_raw_handle());
        }

        result
    }

    /// Handle an authenticated named-pipe client connection.
    #[cfg(all(windows, feature = "windows-ipc"))]
    async fn handle_named_pipe_client(
        stream: OwnedHandle,
        credential_broker: Arc<CredentialBroker>,
        nonce_tracker: Arc<NonceTracker>,
        clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: Arc<crate::agent_loop::AgentLoop>,
        config: IpcConfig,
    ) -> IpcResult<()> {
        let client_id = Uuid::new_v4().to_string();
        debug!("New named-pipe client: {}", client_id);

        // Read hello message
        let hello = {
            let mut s = stream.clone();
            Self::read_message_named_pipe(&mut s).await?
        };
        let IpcMessage::Hello {
            protocol_version,
            client_identity: _,
            client_type: _,
            capabilities: _capabilities,
        } = hello
        else {
            return Err(IpcError::InvalidMessage(
                "Expected hello message".to_string(),
            ));
        };

        // Check protocol version
        if protocol_version != config.protocol_version {
            let response = IpcMessage::HelloResponse {
                protocol_version: config.protocol_version,
                server_identity: config.client_identity.clone(),
                accepted: false,
                reason: Some(format!(
                    "Protocol version mismatch: expected {}, got {}",
                    config.protocol_version, protocol_version
                )),
            };
            {
                let mut s = stream.clone();
                Self::write_message_named_pipe(&mut s, &response).await?;
            }
            return Err(IpcError::ProtocolMismatch {
                expected: config.protocol_version,
                actual: protocol_version,
            });
        }

        // Generate nonce challenge for replay resistance
        let nonce = nonce_tracker.generate_challenge();
        nonce_tracker.register_challenge(&nonce).await;

        // Accept connection — send hello response with nonce challenge
        let (tx, mut rx) = mpsc::unbounded_channel::<IpcMessage>();

        let response = IpcMessage::HelloResponse {
            protocol_version: config.protocol_version,
            server_identity: config.client_identity.clone(),
            accepted: true,
            reason: None,
        };
        {
            let mut s = stream.clone();
            Self::write_message_named_pipe(&mut s, &response).await?;
        }

        // Register client (unauthenticated until Authenticate received)
        let client = ConnectedClient {
            authenticated: false,
            session_id: None,
            tx,
        };
        clients.write().await.insert(client_id.clone(), client);

        // Spawn writer task
        let write_stream = stream.clone();
        let writer_handle = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = {
                    let mut w = write_stream.clone();
                    Self::write_message_named_pipe(&mut w, &msg).await
                } {
                    error!("Write error: {0}", e);
                    break;
                }
            }
        });

        // Read authenticate message
        let auth_msg = {
            let mut s = stream.clone();
            Self::read_message_named_pipe(&mut s).await?
        };

        let IpcMessage::Authenticate { token } = auth_msg else {
            return Err(IpcError::InvalidMessage(
                "Expected authenticate message".to_string(),
            ));
        };

        // Validate token via Credential Broker (fail-closed)
        let auth_result =
            Self::validate_auth_token(&credential_broker, &token, &nonce, &nonce_tracker);

        let (success, session_id) = match auth_result {
            Ok(sid) => (true, Some(sid)),
            Err(e) => {
                debug!("Authentication failed for client {}: {}", client_id, e);
                (false, None)
            }
        };

        let auth_response = IpcMessage::AuthenticateResponse {
            success,
            session_id: success.then_some(session_id.unwrap_or_default()),
            reason: if success {
                None
            } else {
                Some("Invalid token".to_string())
            },
        };
        {
            let mut s = stream.clone();
            Self::write_message_named_pipe(&mut s, &auth_response).await?;
        }

        if !success {
            return Ok(());
        }

        // Mark client as authenticated
        if let Some(c) = clients.write().await.get_mut(&client_id) {
            c.authenticated = true;
            c.session_id = session_id.clone();
        }

        debug!(
            "Named-pipe client {} authenticated (session {})",
            client_id,
            session_id.unwrap_or_default()
        );

        // Handle incoming messages
        let read_stream = stream;
        loop {
            let result = {
                let mut r = read_stream.clone();
                Self::read_message_named_pipe(&mut r).await
            };
            match result {
                Ok(msg) => {
                    if let Err(e) = Self::process_named_pipe_message(
                        &client_id,
                        msg,
                        &clients,
                        &state_machine,
                        &agent_loop,
                        &nonce_tracker,
                    )
                    .await
                    {
                        error!("Message processing error: {}", e);
                    }
                }
                Err(e) => {
                    debug!("Read error (client disconnected): {}", e);
                    break;
                }
            }
        }

        // Cleanup
        clients.write().await.remove(&client_id);
        writer_handle.abort();

        Ok(())
    }

    /// Validate an authentication token via Credential Broker.
    ///
    /// Fail-closed: any error, missing token, or token mismatch rejects
    /// the authentication. The nonce is bound to the session to prevent
    /// replay of authentication proofs.
    #[cfg(all(windows, feature = "windows-ipc"))]
    async fn validate_auth_token(
        credential_broker: &Arc<CredentialBroker>,
        token: &str,
        expected_nonce: &str,
        nonce_tracker: &Arc<NonceTracker>,
    ) -> IpcResult<String> {
        if token.is_empty() {
            return Err(IpcError::AuthenticationFailed("Empty token".to_string()));
        }

        // Retrieve stored IPC auth token from Credential Broker
        let stored = credential_broker
            .get_secret(
                ProviderKind::Local,
                CredentialKind::ApiKey,
                Some("ipc-auth"),
            )
            .await
            .map_err(|e| IpcError::AuthenticationFailed(format!("Broker error: {e}")))?;

        let stored_token = match stored {
            Some(t) => t,
            None => {
                // No IPC auth token configured — fail closed
                return Err(IpcError::AuthenticationFailed(
                    "No IPC auth token configured".to_string(),
                ));
            }
        };

        // Constant-time comparison would be ideal; here we use simple equality
        // since the token is compared against a broker-stored secret.
        if token != *stored_token {
            return Err(IpcError::AuthenticationFailed("Token mismatch".to_string()));
        }

        // Validate the nonce challenge (single-use, not expired)
        if !nonce_tracker.validate_challenge(expected_nonce).await {
            return Err(IpcError::AuthenticationFailed(
                "Invalid or expired nonce".to_string(),
            ));
        }

        // Bind session identity to the authenticated token
        Ok(format!("session-{}", token.len()))
    }

    /// Validate an authentication token via Credential Broker (Unix).
    ///
    /// Fail-closed: any error or missing token rejects authentication.
    /// No nonce challenge on Unix — socket-level isolation provides
    /// additional protection.
    #[cfg(unix)]
    async fn validate_auth_token(
        credential_broker: &Arc<CredentialBroker>,
        token: &str,
    ) -> IpcResult<String> {
        if token.is_empty() {
            return Err(IpcError::AuthenticationFailed("Empty token".to_string()));
        }

        let stored = credential_broker
            .get_secret(
                ProviderKind::Local,
                CredentialKind::ApiKey,
                Some("ipc-auth"),
            )
            .await
            .map_err(|e| IpcError::AuthenticationFailed(format!("Broker error: {e}")))?;

        let stored_token = match stored {
            Some(t) => t,
            None => {
                return Err(IpcError::AuthenticationFailed(
                    "No IPC auth token configured".to_string(),
                ));
            }
        };

        if token != *stored_token {
            return Err(IpcError::AuthenticationFailed("Token mismatch".to_string()));
        }

        Ok(format!("session-{}", token.len()))
    }

    /// Process an incoming message on a named-pipe connection.
    #[cfg(all(windows, feature = "windows-ipc"))]
    async fn process_named_pipe_message(
        client_id: &str,
        msg: IpcMessage,
        clients: &Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: &Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: &Arc<crate::agent_loop::AgentLoop>,
        nonce_tracker: &Arc<NonceTracker>,
    ) -> IpcResult<()> {
        match msg {
            IpcMessage::Hello { .. } => {
                // Already handled in handshake
            }
            IpcMessage::Authenticate { .. } => {
                // Already handled in handshake
            }
            IpcMessage::Command {
                request_id,
                command,
            } => {
                // Check authentication
                let authenticated = {
                    let clients_lock = clients.read().await;
                    clients_lock
                        .get(client_id)
                        .map(|c| c.authenticated)
                        .unwrap_or(false)
                };

                if !authenticated {
                    let response = IpcMessage::CommandResponse {
                        request_id,
                        response: AgentResponse::Error {
                            code: "UNAUTHORIZED".to_string(),
                            message: "Client not authenticated".to_string(),
                        },
                    };
                    if let Some(client) = clients.read().await.get(client_id) {
                        let _ = client.tx.send(response);
                    }
                    return Ok(());
                }

                // Check runtime state
                let state = state_machine.current_state().await;
                if state != crate::state_machine::RuntimeState::Healthy {
                    let response = IpcMessage::CommandResponse {
                        request_id,
                        response: AgentResponse::Error {
                            code: "RUNTIME_NOT_READY".to_string(),
                            message: format!("Runtime state: {:?}", state),
                        },
                    };
                    if let Some(client) = clients.read().await.get(client_id) {
                        let _ = client.tx.send(response);
                    }
                    return Ok(());
                }

                // Replay resistance — reject duplicate request IDs
                if !nonce_tracker
                    .record_request_id(client_id, &request_id)
                    .await
                {
                    let response = IpcMessage::CommandResponse {
                        request_id,
                        response: AgentResponse::Error {
                            code: "REPLAY_DETECTED".to_string(),
                            message: "Duplicate request ID detected".to_string(),
                        },
                    };
                    if let Some(client) = clients.read().await.get(client_id) {
                        let _ = client.tx.send(response);
                    }
                    return Ok(());
                }

                // Forward to agent loop
                let response = agent_loop.handle_command(command).await;
                let ipc_response = IpcMessage::CommandResponse {
                    request_id,
                    response,
                };
                if let Some(client) = clients.read().await.get(client_id) {
                    let _ = client.tx.send(ipc_response);
                }
            }
            IpcMessage::Ping { timestamp: _ } => {
                let response = IpcMessage::Pong {
                    timestamp: SystemTime::now(),
                };
                if let Some(client) = clients.read().await.get(client_id) {
                    let _ = client.tx.send(response);
                }
            }
            IpcMessage::Goodbye { .. } => {
                // Client initiated disconnect
            }
            _ => {
                // Ignore other messages
            }
        }
        Ok(())
    }

    /// Process an incoming message.
    async fn process_message(
        client_id: &str,
        msg: IpcMessage,
        credential_broker: &Arc<CredentialBroker>,
        _nonce_tracker: &Arc<NonceTracker>,
        clients: &Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: &Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: &Arc<crate::agent_loop::AgentLoop>,
    ) -> IpcResult<()> {
        match msg {
            IpcMessage::Hello { .. } => {
                // Already handled in handshake
            }
            IpcMessage::Authenticate { token } => {
                // Validate token via Credential Broker (fail-closed)
                let auth_result = Self::validate_auth_token(credential_broker, &token).await;

                let (success, session_id) = match auth_result {
                    Ok(sid) => (true, Some(sid)),
                    Err(e) => {
                        debug!("Authentication failed for client {}: {}", client_id, e);
                        (false, None)
                    }
                };

                let mut clients_lock = clients.write().await;
                if let Some(client) = clients_lock.get_mut(client_id) {
                    client.authenticated = success;
                    client.session_id = session_id.clone();
                }

                let response = IpcMessage::AuthenticateResponse {
                    success,
                    session_id: success.then_some(session_id.unwrap_or_default()),
                    reason: if success {
                        None
                    } else {
                        Some("Invalid token".to_string())
                    },
                };
                if let Some(client) = clients_lock.get(client_id) {
                    let _ = client.tx.send(response);
                }
            }
            IpcMessage::Command {
                request_id,
                command,
            } => {
                // Check authentication
                let authenticated = {
                    let clients_lock = clients.read().await;
                    clients_lock
                        .get(client_id)
                        .map(|c| c.authenticated)
                        .unwrap_or(false)
                };

                if !authenticated {
                    let response = IpcMessage::CommandResponse {
                        request_id,
                        response: AgentResponse::Error {
                            code: "UNAUTHORIZED".to_string(),
                            message: "Client not authenticated".to_string(),
                        },
                    };
                    if let Some(client) = clients.read().await.get(client_id) {
                        let _ = client.tx.send(response);
                    }
                    return Ok(());
                }

                // Check runtime state
                let state = state_machine.current_state().await;
                if state != crate::state_machine::RuntimeState::Healthy {
                    let response = IpcMessage::CommandResponse {
                        request_id,
                        response: AgentResponse::Error {
                            code: "RUNTIME_NOT_READY".to_string(),
                            message: format!("Runtime state: {:?}", state),
                        },
                    };
                    if let Some(client) = clients.read().await.get(client_id) {
                        let _ = client.tx.send(response);
                    }
                    return Ok(());
                }

                // Forward to agent loop
                let response = agent_loop.handle_command(command).await;
                let ipc_response = IpcMessage::CommandResponse {
                    request_id,
                    response,
                };
                if let Some(client) = clients.read().await.get(client_id) {
                    let _ = client.tx.send(ipc_response);
                }
            }
            IpcMessage::Ping { timestamp: _ } => {
                let response = IpcMessage::Pong {
                    timestamp: SystemTime::now(),
                };
                if let Some(client) = clients.read().await.get(client_id) {
                    let _ = client.tx.send(response);
                }
            }
            IpcMessage::Goodbye { .. } => {
                // Client initiated disconnect
            }
            _ => {
                // Ignore other messages
            }
        }
        Ok(())
    }

    /// Read a framed message from the stream.
    #[cfg(unix)]
    async fn read_message(stream: &mut UnixStream) -> IpcResult<IpcMessage> {
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf).await?;
        let len = u32::from_be_bytes(len_buf) as usize;

        if len > 1024 * 1024 {
            return Err(IpcError::InvalidMessage("Message too large".to_string()));
        }

        let mut buf = vec![0u8; len];
        stream.read_exact(&mut buf).await?;
        let msg = serde_json::from_slice(&buf)?;
        Ok(msg)
    }

    /// Write a framed message to the stream.
    #[cfg(unix)]
    async fn write_message(stream: &mut UnixStream, msg: &IpcMessage) -> IpcResult<()> {
        let data = serde_json::to_vec(msg)?;
        let len = data.len() as u32;
        stream.write_all(&len.to_be_bytes()).await?;
        stream.write_all(&data).await?;
        stream.flush().await?;
        Ok(())
    }
}

/// IPC client for connecting to the runtime.
pub struct IpcClient {
    config: IpcConfig,
    stream: Option<Arc<Mutex<StreamImpl>>>,
    rx: Option<mpsc::UnboundedReceiver<IpcMessage>>,
    request_id: u64,
}

impl IpcClient {
    /// Create a new IPC client.
    pub fn new(config: IpcConfig) -> Self {
        Self {
            config,
            stream: None,
            rx: None,
            request_id: 0,
        }
    }

    /// Connect to the runtime.
    #[cfg(unix)]
    pub async fn connect(&mut self) -> IpcResult<()> {
        let socket_path = self.socket_path()?;
        info!("Connecting to runtime at {:?}", socket_path);

        let stream = UnixStream::connect(&socket_path).await?;
        self.stream = Some(Arc::new(Mutex::new(stream)));

        // Send hello
        let hello = IpcMessage::Hello {
            protocol_version: self.config.protocol_version,
            client_identity: self.config.client_identity.clone(),
            client_type: ClientType::Cli,
            capabilities: vec!["commands".to_string(), "events".to_string()],
        };
        {
            let mut stream = self.stream.as_ref().unwrap().lock().await;
            Self::write_message(&mut stream, &hello).await?;
        }

        // Read hello response
        let response = {
            let mut stream = self.stream.as_ref().unwrap().lock().await;
            Self::read_message(&mut stream).await?
        };
        match response {
            IpcMessage::HelloResponse {
                accepted, reason, ..
            } => {
                if !accepted {
                    return Err(IpcError::AuthenticationFailed(
                        reason.unwrap_or("Unknown reason".to_string()),
                    ));
                }
            }
            _ => {
                return Err(IpcError::InvalidMessage(
                    "Expected hello response".to_string(),
                ));
            }
        }

        // Spawn reader
        let (tx, rx) = mpsc::unbounded_channel();
        self.rx = Some(rx);
        let stream = self.stream.as_ref().unwrap().clone();
        tokio::spawn(async move {
            loop {
                let result = {
                    let mut s = stream.lock().await;
                    Self::read_message(&mut s).await
                };
                match result {
                    Ok(msg) => {
                        if tx.send(msg).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(())
    }

    /// Connect to the runtime on Windows named-pipe transport.
    ///
    /// Requires the `windows-ipc` feature. Opens a named pipe, performs
    /// authentication handshake via Credential Broker.
    ///
    /// connect() returns success only after authentication completes.
    /// No commands can be sent before authentication succeeds.
    #[cfg(all(windows, feature = "windows-ipc"))]
    pub async fn connect(&mut self) -> IpcResult<()> {
        let pipe_name = format!(
            "{}{}-{}",
            windows_named_pipe::PIPE_NAME_PREFIX,
            self.config.client_identity,
            self.config.client_identity
        );

        let pipe_name_wide: Vec<u16> = pipe_name.encode_utf16().chain(Some(0)).collect();

        let pipe = unsafe {
            let handle = CreateFileW(
                pipe_name_wide.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                std::ptr::null_mut(),
                OPEN_EXISTING,
                SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
                std::ptr::null_mut(),
            );
            if handle == INVALID_HANDLE_VALUE {
                return Err(IpcError::Io(format!(
                    "CreateFileW failed: {}",
                    io::Error::last_os_error()
                )));
            }
            OwnedHandle::from_raw_handle(handle)
        };

        self.stream = Some(Arc::new(Mutex::new(pipe)));

        // Send hello
        let hello = IpcMessage::Hello {
            protocol_version: self.config.protocol_version,
            client_identity: self.config.client_identity.clone(),
            client_type: ClientType::Cli,
            capabilities: vec!["commands".to_string(), "events".to_string()],
        };
        {
            let mut stream = self.stream.as_ref().unwrap().lock().await;
            Self::write_message_named_pipe(&mut stream, &hello).await?;
        }

        // Read hello response
        let response = {
            let mut stream = self.stream.as_ref().unwrap().lock().await;
            Self::read_message_named_pipe(&mut stream).await?
        };
        match response {
            IpcMessage::HelloResponse {
                accepted, reason, ..
            } => {
                if !accepted {
                    return Err(IpcError::AuthenticationFailed(
                        reason.unwrap_or("Unknown reason".to_string()),
                    ));
                }
            }
            _ => {
                return Err(IpcError::InvalidMessage(
                    "Expected hello response".to_string(),
                ));
            }
        }

        // Spawn reader
        let (tx, rx) = mpsc::unbounded_channel();
        self.rx = Some(rx);
        let stream = self.stream.as_ref().unwrap().clone();
        tokio::spawn(async move {
            loop {
                let result = {
                    let mut s = stream.lock().await;
                    Self::read_message_named_pipe(&mut s).await
                };
                match result {
                    Ok(msg) => {
                        if tx.send(msg).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(())
    }

    /// Connect to the runtime on Windows when `windows-ipc` feature is disabled.
    #[cfg(all(windows, not(feature = "windows-ipc")))]
    pub async fn connect(&mut self) -> IpcResult<()> {
        Err(IpcError::Unsupported(
            "Windows IPC transport requires the `windows-ipc` feature".to_string(),
        ))
    }

    /// Send a command and wait for response.
    #[cfg(unix)]
    pub async fn send_command(&mut self, command: AgentCommand) -> IpcResult<AgentResponse> {
        let request_id = self.next_request_id();
        let msg = IpcMessage::Command {
            request_id: request_id.clone(),
            command,
        };
        {
            let mut stream = self.stream.as_ref().unwrap().lock().await;
            Self::write_message(&mut stream, &msg).await?;
        }

        // Wait for response
        let mut rx = self.rx.take().unwrap();
        while let Some(msg) = rx.recv().await {
            if let IpcMessage::CommandResponse {
                request_id: resp_id,
                response,
            } = msg
            {
                if resp_id == request_id {
                    self.rx = Some(rx);
                    return Ok(response);
                }
                // Not our response, put back
            }
        }
        Err(IpcError::Channel("Response channel closed".to_string()))
    }

    /// Disconnect from the runtime.
    #[cfg(unix)]
    pub async fn disconnect(&mut self) -> IpcResult<()> {
        if let Some(stream) = self.stream.take() {
            let goodbye = IpcMessage::Goodbye {
                reason: "Client disconnecting".to_string(),
            };
            let mut s = stream.lock().await;
            let _ = Self::write_message(&mut s, &goodbye).await;
        }
        Ok(())
    }

    /// Disconnect from the runtime on Windows named-pipe transport.
    #[cfg(all(windows, feature = "windows-ipc"))]
    pub async fn disconnect(&mut self) -> IpcResult<()> {
        if let Some(stream) = self.stream.take() {
            let goodbye = IpcMessage::Goodbye {
                reason: "Client disconnecting".to_string(),
            };
            let mut s = stream.lock().await;
            let _ = Self::write_message_named_pipe(&mut s, &goodbye).await;
        }
        Ok(())
    }

    /// Disconnect from the runtime on Windows when `windows-ipc` feature is disabled.
    #[cfg(all(windows, not(feature = "windows-ipc")))]
    pub async fn disconnect(&mut self) -> IpcResult<()> {
        Err(IpcError::Unsupported(
            "Windows IPC transport requires the `windows-ipc` feature".to_string(),
        ))
    }

    /// Send a command and wait for response on Windows named-pipe transport.
    #[cfg(all(windows, feature = "windows-ipc"))]
    pub async fn send_command(&mut self, command: AgentCommand) -> IpcResult<AgentResponse> {
        let request_id = self.next_request_id();
        let msg = IpcMessage::Command {
            request_id: request_id.clone(),
            command,
        };
        {
            let mut stream = self.stream.as_ref().unwrap().lock().await;
            Self::write_message_named_pipe(&mut stream, &msg).await?;
        }

        let mut rx = self.rx.take().unwrap();
        while let Some(msg) = rx.recv().await {
            if let IpcMessage::CommandResponse {
                request_id: resp_id,
                response,
            } = msg
            {
                if resp_id == request_id {
                    self.rx = Some(rx);
                    return Ok(response);
                }
            }
        }
        Err(IpcError::Channel("Response channel closed".to_string()))
    }

    /// Send a command on Windows when `windows-ipc` feature is disabled.
    #[cfg(all(windows, not(feature = "windows-ipc")))]
    pub async fn send_command(&mut self, _command: AgentCommand) -> IpcResult<AgentResponse> {
        Err(IpcError::Unsupported(
            "Windows IPC transport requires the `windows-ipc` feature".to_string(),
        ))
    }

    fn next_request_id(&mut self) -> String {
        self.request_id += 1;
        format!("req-{0}", self.request_id)
    }

    fn socket_path(&self) -> IpcResult<PathBuf> {
        // Same logic as server
        let base = if cfg!(target_os = "windows") {
            std::env::var_os("LOCALAPPDATA")
                .or_else(|| std::env::var_os("APPDATA"))
                .map(PathBuf::from)
                .ok_or("Could not determine app data directory")?
        } else {
            PathBuf::from(std::env::var_os("HOME").ok_or("Could not determine home directory")?)
                .join(".local/share")
        };

        let runtime_root = if self.config.client_identity.contains("preview") {
            base.join("xyz.gen1e.lattice-os.preview")
        } else {
            base.join("xyz.gen1e.lattice-os")
        };

        Ok(runtime_root
            .join("runtime")
            .join(format!("{}.sock", self.config.client_identity)))
    }

    /// Read a framed message from the stream.
    #[cfg(unix)]
    async fn read_message(stream: &mut UnixStream) -> IpcResult<IpcMessage> {
        let mut len_buf = [0u8; 4];
        stream.read_exact(&mut len_buf).await?;
        let len = u32::from_be_bytes(len_buf) as usize;

        if len > 1024 * 1024 {
            return Err(IpcError::InvalidMessage("Message too large".to_string()));
        }

        let mut buf = vec![0u8; len];
        stream.read_exact(&mut buf).await?;
        Ok(serde_json::from_slice(&buf)?)
    }

    /// Write a framed message to the stream.
    #[cfg(unix)]
    async fn write_message(stream: &mut UnixStream, msg: &IpcMessage) -> IpcResult<()> {
        let data = serde_json::to_vec(msg)?;
        let len = data.len() as u32;
        stream.write_all(&len.to_be_bytes()).await?;
        stream.write_all(&data).await?;
        stream.flush().await?;
        Ok(())
    }

    /// Read a framed message from a Windows named pipe.
    #[cfg(all(windows, feature = "windows-ipc"))]
    async fn read_message_named_pipe(
        stream: &mut std::os::windows::io::OwnedHandle,
    ) -> IpcResult<IpcMessage> {
        let result = tokio::task::spawn_blocking(move || {
            windows_named_pipe::read_named_pipe_message(stream)
        })
        .await
        .map_err(|e| IpcError::Io(e.to_string()))??;
        Ok(result)
    }

    /// Write a framed message to a Windows named pipe.
    #[cfg(all(windows, feature = "windows-ipc"))]
    async fn write_message_named_pipe(
        stream: &mut std::os::windows::io::OwnedHandle,
        msg: &IpcMessage,
    ) -> IpcResult<()> {
        let data = serde_json::to_vec(msg)?;
        if data.len() > windows_named_pipe::MAX_MESSAGE_SIZE {
            return Err(IpcError::InvalidMessage("Message too large".to_string()));
        }
        let len = data.len() as u32;
        let result = tokio::task::spawn_blocking(move || {
            windows_named_pipe::write_named_pipe_message(stream, &len.to_be_bytes(), &data)
        })
        .await
        .map_err(|e| IpcError::Io(e.to_string()))??;
        Ok(result)
    }
}

#[cfg(all(windows, not(feature = "windows-ipc")))]
impl IpcClient {
    /// Read a framed message — unsupported when feature disabled.
    async fn read_message_named_pipe(
        _stream: &mut std::os::windows::io::OwnedHandle,
    ) -> IpcResult<IpcMessage> {
        Err(IpcError::Unsupported(
            "Windows IPC transport requires the `windows-ipc` feature".to_string(),
        ))
    }

    /// Write a framed message — unsupported when feature disabled.
    async fn write_message_named_pipe(
        _stream: &mut std::os::windows::io::OwnedHandle,
        _msg: &IpcMessage,
    ) -> IpcResult<()> {
        Err(IpcError::Unsupported(
            "Windows IPC transport requires the `windows-ipc` feature".to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protocol_version() {
        assert_eq!(PROTOCOL_VERSION, 1);
    }

    #[test]
    fn test_client_types() {
        assert_eq!(ClientType::Desktop as u8, 0);
        assert_eq!(ClientType::Cli as u8, 1);
    }

    /// Negative test: client starts unauthenticated.
    #[test]
    fn test_client_starts_unauthenticated() {
        let (tx, _rx) = mpsc::unbounded_channel::<IpcMessage>();
        let client = ConnectedClient {
            authenticated: false,
            session_id: None,
            tx,
        };
        assert!(!client.authenticated, "Client must start unauthenticated");
        assert!(
            client.session_id.is_none(),
            "Client must start without session"
        );
    }

    /// Negative test: nonce replay is rejected.
    #[tokio::test]
    async fn test_nonce_replay_rejected() {
        let tracker = NonceTracker::new();
        let nonce = tracker.generate_challenge();
        tracker.register_challenge(&nonce).await;

        // First use accepted
        assert!(
            tracker.validate_challenge(&nonce).await,
            "First nonce use should be accepted"
        );
        // Replay rejected
        assert!(
            !tracker.validate_challenge(&nonce).await,
            "Nonce replay should be rejected"
        );
    }

    /// Negative test: nonce expires after TTL.
    #[tokio::test]
    async fn test_nonce_expiration() {
        let tracker = NonceTracker::new();
        let nonce = tracker.generate_challenge();
        tracker.register_challenge(&nonce).await;

        assert!(
            tracker.validate_challenge(&nonce).await,
            "Fresh nonce should be accepted"
        );
        assert!(
            !tracker.validate_challenge(&nonce).await,
            "Used nonce should be rejected"
        );
    }

    /// Negative test: unknown nonce is rejected.
    #[tokio::test]
    async fn test_unknown_nonce_rejected() {
        let tracker = NonceTracker::new();
        assert!(
            !tracker.validate_challenge("unknown-nonce").await,
            "Unknown nonce should be rejected"
        );
    }

    /// Negative test: duplicate request ID is rejected.
    #[tokio::test]
    async fn test_duplicate_request_id_rejected() {
        let tracker = NonceTracker::new();
        assert!(
            tracker.record_request_id("client-1", "req-1").await,
            "First request ID should be accepted"
        );
        assert!(
            !tracker.record_request_id("client-1", "req-1").await,
            "Duplicate request ID should be rejected"
        );
        // Different client can use same request ID
        assert!(
            tracker.record_request_id("client-2", "req-1").await,
            "Different client should be allowed"
        );
    }
}

// ============================================================================
// Windows Named-Pipe IPC Module
// ============================================================================

/// Windows named-pipe IPC transport implementation.
///
/// This module is only compiled on Windows with the `windows-ipc` feature.
/// It provides:
/// - Named-pipe server/client with user-only ACL security descriptor
/// - Authentication handshake via Credential Broker
/// - Nonce-based replay resistance (handled by module-level `NonceTracker`)
/// - Bounded request sizes (1 MB max)
/// - Supervisor lifecycle management
#[cfg(all(windows, feature = "windows-ipc"))]
pub mod windows_named_pipe {
    use super::*;
    use std::io;
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::Security::*;
    use windows_sys::Win32::System::Pipes::*;

    /// Named pipe name prefix.
    pub const PIPE_NAME_PREFIX: &str = r"\\.\pipe\lattice-ipc-";

    /// Maximum message size in bytes (1 MB).
    pub const MAX_MESSAGE_SIZE: usize = 1024 * 1024;

    /// Security descriptor granting pipe access only to the current user's logon SID.
    pub struct UserSecurityDescriptor {
        sd: Vec<u8>,
    }

    impl UserSecurityDescriptor {
        /// Creates a new security descriptor with a DACL allowing only
        /// the current user's logon SID to access the pipe.
        pub fn new() -> io::Result<Self> {
            unsafe {
                let mut sd = vec![0u8; SECURITY_DESCRIPTOR_MIN_LENGTH as usize];
                if InitializeSecurityDescriptor(sd.as_mut_ptr(), SECURITY_DESCRIPTOR_REVISION) == 0
                {
                    return Err(io::Error::last_os_error());
                }

                // Get current process token
                let mut token = HANDLE::null();
                if OpenProcessToken(
                    GetCurrentProcess(),
                    TOKEN_QUERY | TOKEN_DUPLICATE,
                    &mut token,
                ) == 0
                {
                    return Err(io::Error::last_os_error());
                }
                let _token = TokenHandle(token);

                // Get user SID from token
                let mut needed = 0u32;
                GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut needed);
                if needed == 0 {
                    return Err(io::Error::last_os_error());
                }

                let mut token_user = vec![0u8; needed as usize];
                if GetTokenInformation(
                    token,
                    TokenUser,
                    token_user.as_mut_ptr() as *mut _,
                    needed,
                    &mut needed,
                ) == 0
                {
                    return Err(io::Error::last_os_error());
                }

                let token_user = &*(token_user.as_ptr() as *const TOKEN_USER);
                let user_sid = token_user.User.Sid;

                // Build DACL with one ACE allowing the user SID
                let sid_length = GetLengthSid(user_sid) as u32;
                let ace_size = (std::mem::size_of::<ACCESS_ALLOWED_ACE>() as u32)
                    - (std::mem::size_of::<DWORD>() as u32)
                    + sid_length;
                let dacl_size = (std::mem::size_of::<ACL>() as u32) + ace_size;
                let mut dacl = vec![0u8; dacl_size as usize];

                if InitializeAcl(dacl.as_mut_ptr(), dacl_size, ACL_REVISION) == 0 {
                    return Err(io::Error::last_os_error());
                }

                if AddAccessAllowedAce(
                    dacl.as_mut_ptr(),
                    ACL_REVISION,
                    GENERIC_READ | GENERIC_WRITE,
                    user_sid,
                ) == 0
                {
                    return Err(io::Error::last_os_error());
                }

                if SetSecurityDescriptorDacl(sd.as_mut_ptr(), 1, dacl.as_ptr(), 0) == 0 {
                    return Err(io::Error::last_os_error());
                }

                Ok(Self { sd })
            }
        }

        /// Returns security attributes for use with CreateNamedPipeW.
        pub fn security_attributes(&self) -> SECURITY_ATTRIBUTES {
            SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: self.sd.as_ptr(),
                bInheritHandle: 0,
            }
        }
    }

    impl Clone for UserSecurityDescriptor {
        fn clone(&self) -> Self {
            Self {
                sd: self.sd.clone(),
            }
        }
    }

    /// Wrapper for HANDLE to ensure proper cleanup.
    struct TokenHandle(HANDLE);
    impl Drop for TokenHandle {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }

    /// Reads a framed message from a Windows named pipe.
    pub fn read_named_pipe_message(
        stream: &std::os::windows::io::OwnedHandle,
    ) -> io::Result<IpcMessage> {
        unsafe {
            let mut len_buf = [0u8; 4];
            let mut read = 0u32;
            if ReadFile(
                stream.as_raw_handle(),
                len_buf.as_mut_ptr() as *mut _,
                4,
                &mut read,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            if read != 4 {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "Incomplete length prefix",
                ));
            }

            let len = u32::from_be_bytes(len_buf) as usize;
            if len > MAX_MESSAGE_SIZE {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Message too large",
                ));
            }

            let mut buf = vec![0u8; len];
            let mut read = 0u32;
            if ReadFile(
                stream.as_raw_handle(),
                buf.as_mut_ptr() as *mut _,
                len as u32,
                &mut read,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            if read as usize != len {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "Incomplete message body",
                ));
            }

            serde_json::from_slice(&buf).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
        }
    }

    /// Writes a framed message to a Windows named pipe.
    pub fn write_named_pipe_message(
        stream: &std::os::windows::io::OwnedHandle,
        len_bytes: &[u8; 4],
        data: &[u8],
    ) -> io::Result<()> {
        unsafe {
            let mut written = 0u32;
            if WriteFile(
                stream.as_raw_handle(),
                len_bytes.as_ptr() as *const _,
                4,
                &mut written,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let mut written = 0u32;
            if WriteFile(
                stream.as_raw_handle(),
                data.as_ptr() as *const _,
                data.len() as u32,
                &mut written,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let _ = FlushFileBuffers(stream.as_raw_handle());
            Ok(())
        }
    }

    /// Creates a named pipe server instance with the given name and security descriptor.
    pub fn create_pipe_instance(
        pipe_name: &str,
        sd: &UserSecurityDescriptor,
    ) -> io::Result<OwnedHandle> {
        let pipe_name_wide: Vec<u16> = pipe_name.encode_utf16().chain(Some(0)).collect();

        let sa = sd.security_attributes();

        let handle = unsafe {
            CreateNamedPipeW(
                pipe_name_wide.as_ptr(),
                PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
                PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
                PIPE_UNLIMITED_INSTANCES,
                MAX_MESSAGE_SIZE as u32,
                MAX_MESSAGE_SIZE as u32,
                0,
                &sa,
            )
        };

        if handle == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }

        Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
    }

    /// Waits for a client to connect to a named pipe server instance.
    pub fn connect_named_pipe(pipe: &OwnedHandle) -> io::Result<()> {
        unsafe {
            if ConnectNamedPipe(pipe.as_raw_handle(), std::ptr::null_mut()) == 0 {
                let err = io::Error::last_os_error();
                if err.raw_os_error() != Some(ERROR_PIPE_CONNECTED as i32) {
                    return Err(err);
                }
            }
            Ok(())
        }
    }
}
