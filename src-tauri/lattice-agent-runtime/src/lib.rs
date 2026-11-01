//! Agent Runtime Supervisor — Local Runtime Ownership (Slice 2)
//!
//! This crate owns the lifecycle and supervision of local agent runtime processes.
//!
//! Runtime lifecycle states:
//! stopped -> starting -> healthy -> stopping -> stopped
//! Include degraded and failed transitions for abnormal conditions.
//!
//! Tauri commands:
//! - agent_start
//! - agent_stop
//! - agent_status
//! - agent_health
//!
//! Provider routing through credential broker (Slice 1).
//! Authenticated IPC with protocol-version negotiation.
//! Crash recovery and session reconciliation.

use lattice_credential_broker::{CredentialBroker, CredentialError, CredentialKind, ProviderKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use thiserror::Error;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

pub mod agent_loop;
pub mod ipc;
pub mod provider_routing;
pub mod session;
pub mod state_machine;

pub use agent_loop::{AgentLoop, AgentLoopConfig, AgentLoopError};
pub use ipc::{IpcClient, IpcError, IpcServer, ProtocolVersion};
pub use provider_routing::{ProviderRouter, ProviderRouterError};
pub use session::{SessionManager, SessionManagerError, SessionRecord};
pub use state_machine::{RuntimeState, RuntimeStateMachine, StateTransitionError};

/// Errors for the agent runtime supervisor.
#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("State machine error: {0}")]
    StateMachine(#[from] StateTransitionError),
    #[error("Agent loop error: {0}")]
    AgentLoop(#[from] AgentLoopError),
    #[error("IPC error: {0}")]
    Ipc(#[from] IpcError),
    #[error("Provider routing error: {0}")]
    ProviderRouting(#[from] ProviderRouterError),
    #[error("Session manager error: {0}")]
    SessionManager(#[from] SessionManagerError),
    #[error("Credential error: {0}")]
    Credential(#[from] CredentialError),
    #[error("Profile not found: {0}")]
    ProfileNotFound(String),
    #[error("Profile already running")]
    AlreadyRunning,
    #[error("Profile not running")]
    NotRunning,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("SQLx error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Protocol version mismatch: expected {expected}, got {actual}")]
    ProtocolMismatch { expected: u32, actual: u32 },
}

pub type Result<T> = std::result::Result<T, RuntimeError>;

/// Agent runtime configuration per profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRuntimeConfig {
    /// Profile ID this runtime belongs to.
    pub profile_id: String,
    /// Channel (stable/preview) for path resolution.
    pub channel: String,
    /// Default provider connection ID.
    pub default_connection_id: Option<String>,
    /// Agent loop configuration.
    pub loop_config: AgentLoopConfig,
    /// IPC configuration.
    pub ipc_config: IpcConfig,
    /// Session configuration.
    pub session_config: SessionConfig,
}

/// IPC configuration for authenticated transport.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcConfig {
    /// Protocol version for negotiation.
    pub protocol_version: u32,
    /// Socket/pipe path (platform-specific).
    pub socket_path: Option<PathBuf>,
    /// Client identity for this runtime instance.
    pub client_identity: String,
    /// Require authentication on connect.
    pub require_auth: bool,
    /// Connection timeout.
    pub connect_timeout_ms: u64,
}

/// Session configuration for durable sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    /// Database path (relative to profile root).
    pub db_path: PathBuf,
    /// Maximum session age before cleanup.
    pub max_session_age: Duration,
    /// Enable automatic reconciliation on startup.
    pub auto_reconcile: bool,
}

/// Runtime health status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeHealth {
    pub state: RuntimeState,
    pub uptime_ms: u64,
    pub active_sessions: usize,
    pub pending_operations: usize,
    pub last_heartbeat: SystemTime,
    pub provider_status: HashMap<String, ProviderHealth>,
    pub errors: Vec<String>,
}

/// Provider health status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderHealth {
    pub connection_id: String,
    pub provider_kind: ProviderKind,
    pub status: ProviderConnectionStatus,
    pub last_check: SystemTime,
    pub latency_ms: Option<u64>,
}

/// Provider connection status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProviderConnectionStatus {
    Connected,
    Disconnected,
    Authenticating,
    Error(String),
}

/// Tauri command: Start the agent runtime for a profile.
#[tauri::command]
pub async fn agent_start(
    profile_id: String,
    channel: String,
    state: tauri::State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeStatusResponse, String> {
    state
        .start_runtime(profile_id, channel)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: Stop the agent runtime for a profile.
#[tauri::command]
pub async fn agent_stop(
    profile_id: String,
    state: tauri::State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeStatusResponse, String> {
    state
        .stop_runtime(profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: Get the agent runtime status for a profile.
#[tauri::command]
pub async fn agent_status(
    profile_id: String,
    state: tauri::State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeStatusResponse, String> {
    state
        .get_status(profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Tauri command: Get the agent runtime health for a profile.
#[tauri::command]
pub async fn agent_health(
    profile_id: String,
    state: tauri::State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeHealth, String> {
    state
        .get_health(profile_id)
        .await
        .map_err(|e| e.to_string())
}

/// Response for runtime status commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStatusResponse {
    pub profile_id: String,
    pub state: RuntimeState,
    pub message: String,
}

/// Runtime supervisor — manages per-profile agent runtimes.
pub struct RuntimeSupervisor {
    /// Profile runtimes: profile_id -> RuntimeInstance
    runtimes: RwLock<HashMap<String, RuntimeInstance>>,
    /// Credential broker for provider routing.
    credential_broker: Arc<CredentialBroker>,
    /// Global configuration defaults.
    config_defaults: AgentRuntimeConfig,
}

/// Runtime instance for a single profile.
struct RuntimeInstance {
    profile_id: String,
    channel: String,
    state_machine: Arc<RuntimeStateMachine>,
    agent_loop: Option<Arc<AgentLoop>>,
    ipc_server: Option<Arc<IpcServer>>,
    session_manager: Arc<SessionManager>,
    provider_router: Arc<ProviderRouter>,
    started_at: SystemTime,
}

impl RuntimeSupervisor {
    /// Create a new runtime supervisor.
    pub async fn new(
        credential_broker: Arc<CredentialBroker>,
        config_defaults: AgentRuntimeConfig,
    ) -> Result<Self> {
        Ok(Self {
            runtimes: RwLock::new(HashMap::new()),
            credential_broker,
            config_defaults,
        })
    }

    /// Start the agent runtime for a profile.
    pub async fn start_runtime(
        &self,
        profile_id: String,
        channel: String,
    ) -> Result<RuntimeStatusResponse> {
        let mut runtimes = self.runtimes.write().await;

        // Check if already running
        if let Some(instance) = runtimes.get(&profile_id) {
            if instance.state_machine.current_state() == RuntimeState::Healthy
                || instance.state_machine.current_state() == RuntimeState::Starting
            {
                return Err(RuntimeError::AlreadyRunning);
            }
        }

        // Create runtime instance
        let instance = self
            .create_instance(profile_id.clone(), channel.clone())
            .await?;

        // Start the state machine
        instance
            .state_machine
            .transition_to(RuntimeState::Starting)
            .await?;

        // Initialize components
        let agent_loop = Arc::new(
            AgentLoop::new(
                instance.session_manager.clone(),
                instance.provider_router.clone(),
                instance.state_machine.clone(),
                instance.loop_config.clone(),
            )
            .await?,
        );

        let ipc_server = Arc::new(
            IpcServer::new(
                instance.profile_id.clone(),
                instance.ipc_config.clone(),
                instance.state_machine.clone(),
                agent_loop.clone(),
            )
            .await?,
        );

        // Start IPC server
        ipc_server.start().await?;

        // Start agent loop
        agent_loop.start().await?;

        // Transition to healthy
        instance
            .state_machine
            .transition_to(RuntimeState::Healthy)
            .await?;

        // Store runtime instance
        runtimes.insert(
            profile_id.clone(),
            RuntimeInstance {
                profile_id: profile_id.clone(),
                channel,
                state_machine: instance.state_machine,
                agent_loop: Some(agent_loop),
                ipc_server: Some(ipc_server),
                session_manager: instance.session_manager,
                provider_router: instance.provider_router,
                started_at: SystemTime::now(),
            },
        );

        Ok(RuntimeStatusResponse {
            profile_id,
            state: RuntimeState::Healthy,
            message: "Agent runtime started".to_string(),
        })
    }

    /// Stop the agent runtime for a profile.
    pub async fn stop_runtime(&self, profile_id: String) -> Result<RuntimeStatusResponse> {
        let mut runtimes = self.runtimes.write().await;

        let instance = runtimes
            .get_mut(&profile_id)
            .ok_or_else(|| RuntimeError::ProfileNotFound(profile_id.clone()))?;

        // Transition to stopping
        instance
            .state_machine
            .transition_to(RuntimeState::Stopping)
            .await?;

        // Stop agent loop
        if let Some(agent_loop) = instance.agent_loop.take() {
            agent_loop.stop().await?;
        }

        // Stop IPC server
        if let Some(ipc_server) = instance.ipc_server.take() {
            ipc_server.stop().await?;
        }

        // Transition to stopped
        instance
            .state_machine
            .transition_to(RuntimeState::Stopped)
            .await?;

        Ok(RuntimeStatusResponse {
            profile_id,
            state: RuntimeState::Stopped,
            message: "Agent runtime stopped".to_string(),
        })
    }

    /// Get the runtime status for a profile.
    pub async fn get_status(&self, profile_id: String) -> Result<RuntimeStatusResponse> {
        let runtimes = self.runtimes.read().await;

        if let Some(instance) = runtimes.get(&profile_id) {
            let state = instance.state_machine.current_state();
            Ok(RuntimeStatusResponse {
                profile_id,
                state,
                message: format!("Runtime is {:?}", state),
            })
        } else {
            Ok(RuntimeStatusResponse {
                profile_id,
                state: RuntimeState::Stopped,
                message: "Runtime not found".to_string(),
            })
        }
    }

    /// Get the runtime health for a profile.
    pub async fn get_health(&self, profile_id: String) -> Result<RuntimeHealth> {
        let runtimes = self.runtimes.read().await;

        if let Some(instance) = runtimes.get(&profile_id) {
            let state = instance.state_machine.current_state();
            let uptime = instance
                .started_at
                .elapsed()
                .unwrap_or_default()
                .as_millis() as u64;

            // Get provider health
            let mut provider_status = HashMap::new();
            // This would query the provider router for actual health

            Ok(RuntimeHealth {
                state,
                uptime_ms: uptime,
                active_sessions: instance.session_manager.active_session_count().await,
                pending_operations: 0, // TODO: track pending operations
                last_heartbeat: SystemTime::now(),
                provider_status,
                errors: vec![],
            })
        } else {
            Err(RuntimeError::ProfileNotFound(profile_id))
        }
    }

    /// Create a new runtime instance.
    async fn create_instance(
        &self,
        profile_id: String,
        channel: String,
    ) -> Result<RuntimeInstance> {
        // Resolve profile paths
        let profile_root = crate::profiles::resolve_profile_root(&channel)?;
        let profile_path = profile_root.join("profiles").join(&profile_id);

        // Create session manager
        let session_manager = Arc::new(
            SessionManager::new(
                profile_path.join("state.sqlite"),
                self.config_defaults.session_config.clone(),
            )
            .await?,
        );

        // Create provider router
        let provider_router = Arc::new(
            ProviderRouter::new(self.credential_broker.clone(), profile_path.clone()).await?,
        );

        // Create state machine
        let state_machine = Arc::new(RuntimeStateMachine::new());

        // Build config for this instance
        let mut config = self.config_defaults.clone();
        config.profile_id = profile_id.clone();
        config.channel = channel.clone();

        Ok(RuntimeInstance {
            profile_id,
            channel,
            state_machine,
            agent_loop: None,
            ipc_server: None,
            session_manager,
            provider_router,
            started_at: SystemTime::now(),
            loop_config: config.loop_config,
            ipc_config: config.ipc_config,
        })
    }
}

/// Profile path resolution helpers.
mod profiles {
    use std::path::{Path, PathBuf};

    pub fn resolve_profile_root(channel: &str) -> Result<PathBuf, String> {
        let base = if cfg!(target_os = "windows") {
            std::env::var_os("LOCALAPPDATA")
                .or_else(|| std::env::var_os("APPDATA"))
                .map(PathBuf::from)
                .ok_or("Could not determine app data directory")?
        } else {
            PathBuf::from(std::env::var_os("HOME").ok_or("Could not determine home directory")?)
                .join(".local/share")
        };

        match channel {
            "stable" => Ok(base.join("xyz.gen1e.lattice-os")),
            "preview" => Ok(base.join("xyz.gen1e.lattice-os.preview")),
            _ => Err("Invalid channel".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_runtime_supervisor_creation() {
        // This would require a mock credential broker
        // For now, just verify the types compile
    }
}
