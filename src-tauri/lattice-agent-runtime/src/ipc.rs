//! Authenticated IPC transport for agent runtime.
//!
//! Provides protocol-version negotiation, client identity verification,
//! and secure message passing between CLI/desktop and the runtime.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{mpsc, RwLock};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Protocol version for negotiation.
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
}

pub type IpcResult<T> = std::result::Result<T, IpcError>;

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
    Authenticate {
        token: String,
    },
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
    Error {
        code: String,
        message: String,
    },
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

/// Agent commands from clients.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum AgentCommand {
    /// Start a new conversation session.
    StartSession {
        session_id: String,
        provider_connection_id: Option<String>,
        model_id: Option<String>,
    },
    /// Send a message in a session.
    SendMessage {
        session_id: String,
        content: String,
        attachments: Vec<Attachment>,
    },
    /// Cancel an in-flight operation.
    CancelOperation {
        session_id: String,
        operation_id: String,
    },
    /// Get session status.
    GetSessionStatus {
        session_id: String,
    },
    /// List sessions.
    ListSessions {
        limit: Option<usize>,
        offset: Option<usize>,
    },
    /// Resume a session.
    ResumeSession {
        session_id: String,
    },
    /// Get provider status.
    GetProviderStatus,
    /// Switch provider for a session.
    SwitchProvider {
        session_id: String,
        provider_connection_id: String,
    },
}

/// Agent responses to clients.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum AgentResponse {
    /// Session started successfully.
    SessionStarted {
        session_id: String,
    },
    /// Message acknowledged.
    MessageAcknowledged {
        message_id: String,
    },
    /// Operation cancelled.
    OperationCancelled {
        operation_id: String,
    },
    /// Session status.
    SessionStatus {
        session_id: String,
        status: SessionStatus,
    },
    /// Session list.
    SessionList {
        sessions: Vec<SessionSummary>,
    },
    /// Provider status.
    ProviderStatus {
        providers: Vec<ProviderStatus>,
    },
    /// Provider switched.
    ProviderSwitched {
        session_id: String,
        provider_connection_id: String,
    },
    /// Error response.
    Error {
        code: String,
        message: String,
    },
}

/// Attachment for messages.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub path: Option<String>,
}

/// Session status.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionStatus {
    pub session_id: String,
    pub state: SessionState,
    pub provider_connection_id: Option<String>,
    pub model_id: Option<String>,
    pub message_count: usize,
    pub last_activity: SystemTime,
}

/// Session state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum SessionState {
    Created,
    Running,
    WaitingForInput,
    Completed,
    Failed,
    Cancelled,
}

/// Session summary for listing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub title: Option<String>,
    pub state: SessionState,
    pub created_at: SystemTime,
    pub updated_at: SystemTime,
}

/// Provider status summary.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProviderStatus {
    pub connection_id: String,
    pub provider_kind: crate::ProviderKind,
    pub status: crate::ProviderConnectionStatus,
    pub is_default: bool,
}

/// IPC server for the agent runtime.
pub struct IpcServer {
    profile_id: String,
    config: IpcConfig,
    state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
    agent_loop: Arc<crate::agent_loop::AgentLoop>,
    listener: Option<UnixListener>,
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

/// Connected client info.
#[derive(Debug, Clone)]
struct ConnectedClient {
    id: String,
    client_type: ClientType,
    identity: String,
    connected_at: SystemTime,
    authenticated: bool,
    tx: mpsc::UnboundedSender<IpcMessage>,
}

impl IpcServer {
    /// Create a new IPC server.
    pub async fn new(
        profile_id: String,
        config: IpcConfig,
        state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: Arc<crate::agent_loop::AgentLoop>,
    ) -> IpcResult<Self> {
        Ok(Self {
            profile_id,
            config,
            state_machine,
            agent_loop,
            listener: None,
            clients: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx: None,
        })
    }

    /// Start the IPC server.
    pub async fn start(&mut self) -> IpcResult<()> {
        let socket_path = self.socket_path()?;
        info!("Starting IPC server on {:?}", socket_path);

        // Clean up any existing socket
        if socket_path.exists() {
            std::fs::remove_file(&socket_path).ok();
        }

        let listener = UnixListener::bind(&socket_path)?;
        self.listener = Some(listener);

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        self.shutdown_tx = Some(shutdown_tx);

        let clients = self.clients.clone();
        let state_machine = self.state_machine.clone();
        let agent_loop = self.agent_loop.clone();
        let config = self.config.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        info!("IPC server shutdown requested");
                        break;
                    }
                    accept_result = async {
                        if let Some(listener) = &mut self.listener {
                            listener.accept().await
                        } else {
                            std::future::pending().await
                        }
                    } => {
                        match accept_result {
                            Ok((stream, _addr)) => {
                                let clients = clients.clone();
                                let state_machine = state_machine.clone();
                                let agent_loop = agent_loop.clone();
                                let config = config.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = Self::handle_client(
                                        stream,
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
            PathBuf::from(
                std::env::var_os("HOME").ok_or("Could not determine home directory")?,
            ).join(".local/share")
        };

        let runtime_root = if self.config.client_identity.contains("preview") {
            base.join("xyz.gen1e.lattice-os.preview")
        } else {
            base.join("xyz.gen1e.lattice-os")
        };

        let socket_dir = runtime_root.join("runtime");
        std::fs::create_dir_all(&socket_dir).map_err(|e| IpcError::Io(e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&socket_dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| IpcError::Io(e))?;
        }

        Ok(socket_dir.join(format!("{}.sock", self.profile_id)))
    }

    /// Handle a client connection.
    async fn handle_client(
        mut stream: UnixStream,
        clients: Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: Arc<crate::agent_loop::AgentLoop>,
        config: IpcConfig,
    ) -> IpcResult<()> {
        let client_id = Uuid::new_v4().to_string();
        debug!("New client connection: {}", client_id);

        // Read hello message
        let hello = Self::read_message(&mut stream).await?;
        let IpcMessage::Hello {
            protocol_version,
            client_identity,
            client_type,
            capabilities,
        } = hello else {
            return Err(IpcError::InvalidMessage("Expected hello message".to_string()));
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
            Self::write_message(&mut stream, &response).await?;
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
        Self::write_message(&mut stream, &response).await?;

        // Register client
        let client = ConnectedClient {
            id: client_id.clone(),
            client_type,
            identity: client_identity,
            connected_at: SystemTime::now(),
            authenticated: !config.require_auth, // If no auth required, mark as authenticated
            tx,
        };
        clients.write().await.insert(client_id.clone(), client);

        // Spawn writer task
        let mut write_stream = stream;
        let writer_handle = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(e) = Self::write_message(&mut write_stream, &msg).await {
                    error!("Write error: {}", e);
                    break;
                }
            }
        });

        // Handle incoming messages
        let mut read_stream = stream;
        loop {
            match Self::read_message(&mut read_stream).await {
                Ok(msg) => {
                    if let Err(e) = Self::process_message(
                        &client_id,
                        msg,
                        &clients,
                        &state_machine,
                        &agent_loop,
                    ).await {
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

    /// Process an incoming message.
    async fn process_message(
        client_id: &str,
        msg: IpcMessage,
        clients: &Arc<RwLock<HashMap<String, ConnectedClient>>>,
        state_machine: &Arc<crate::state_machine::RuntimeStateMachine>,
        agent_loop: &Arc<crate::agent_loop::AgentLoop>,
    ) -> IpcResult<()> {
        match msg {
            IpcMessage::Hello { .. } => {
                // Already handled in handshake
            }
            IpcMessage::Authenticate { token } => {
                // Simple token-based auth for now
                let mut clients_lock = clients.write().await;
                if let Some(client) = clients_lock.get_mut(client_id) {
                    // In production, validate token against stored credentials
                    let success = !token.is_empty(); // Placeholder
                    client.authenticated = success;

                    let response = IpcMessage::AuthenticateResponse {
                        success,
                        session_id: if success {
                            Some(Uuid::new_v4().to_string())
                        } else {
                            None
                        },
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
                let ipc_response = IpcMessage::CommandResponse { request_id, response };
                if let Some(client) = clients.read().await.get(client_id) {
                    let _ = client.tx.send(ipc_response);
                }
            }
            IpcMessage::Ping { timestamp } => {
                let response = IpcMessage::Pong { timestamp: SystemTime::now() };
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
    stream: Option<UnixStream>,
    client_id: String,
    rx: Option<mpsc::UnboundedReceiver<IpcMessage>>,
    request_id: u64,
}

impl IpcClient {
    /// Create a new IPC client.
    pub fn new(config: IpcConfig) -> Self {
        Self {
            config,
            stream: None,
            client_id: Uuid::new_v4().to_string(),
            rx: None,
            request_id: 0,
        }
    }

    /// Connect to the runtime.
    pub async fn connect(&mut self) -> IpcResult<()> {
        let socket_path = self.socket_path()?;
        info!("Connecting to runtime at {:?}", socket_path);

        let stream = UnixStream::connect(&socket_path).await?;
        self.stream = Some(stream);

        // Send hello
        let hello = IpcMessage::Hello {
            protocol_version: self.config.protocol_version,
            client_identity: self.config.client_identity.clone(),
            client_type: ClientType::Cli,
            capabilities: vec!["commands".to_string(), "events".to_string()],
        };
        Self::write_message(self.stream.as_mut().unwrap(), &hello).await?;

        // Read hello response
        let response = Self::read_message(self.stream.as_mut().unwrap()).await?;
        match response {
            IpcMessage::HelloResponse { accepted, reason, .. } => {
                if !accepted {
                    return Err(IpcError::AuthenticationFailed(
                        reason.unwrap_or("Unknown reason".to_string()),
                    ));
                }
            }
            _ => return Err(IpcError::InvalidMessage("Expected hello response".to_string())),
        }

        // Spawn reader
        let (tx, rx) = mpsc::unbounded_channel();
        self.rx = Some(rx);
        let mut stream = self.stream.as_ref().unwrap().try_clone().await?;
        tokio::spawn(async move {
            loop {
                match Self::read_message(&mut stream).await {
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

    /// Send a command and wait for response.
    pub async fn send_command(&mut self, command: AgentCommand) -> IpcResult<AgentResponse> {
        let request_id = self.next_request_id();
        let msg = IpcMessage::Command { request_id: request_id.clone(), command };
        Self::write_message(self.stream.as_mut().unwrap(), &msg).await?;

        // Wait for response
        let mut rx = self.rx.take().unwrap();
        while let Some(msg) = rx.recv().await {
            match msg {
                IpcMessage::CommandResponse { request_id: resp_id, response } => {
                    if resp_id == request_id {
                        self.rx = Some(rx);
                        return Ok(response);
                    }
                    // Not our response, put back
                }
                _ => {} // Ignore other messages
            }
        }
        Err(IpcError::Channel("Response channel closed".to_string()))
    }

    /// Disconnect from the runtime.
    pub async fn disconnect(&mut self) -> IpcResult<()> {
        if let Some(stream) = self.stream.take() {
            let goodbye = IpcMessage::Goodbye {
                reason: "Client disconnecting".to_string(),
            };
            let _ = Self::write_message(&mut stream.try_clone().await?, &goodbye).await;
        }
        Ok(())
    }

    fn next_request_id(&mut self) -> String {
        self.request_id += 1;
        format!("req-{}", self.request_id)
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

        Ok(runtime_root.join("runtime").join(format!("{}.sock", self.config.client_identity)))
    }

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

    async fn write_message(stream: &mut UnixStream, msg: &IpcMessage) -> IpcResult<()> {
        let data = serde_json::to_vec(msg)?;
        let len = data.len() as u32;
        stream.write_all(&len.to_be_bytes()).await?;
        stream.write_all(&data).await?;
        stream.flush().await?;
        Ok(())
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
}