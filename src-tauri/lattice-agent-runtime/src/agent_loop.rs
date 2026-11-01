//! Agent loop — manages conversation turns, streaming events, and cancellation.
//!
//! The agent loop coordinates:
//! - Turn management (user message -> provider -> response)
//! - Streaming events to connected clients
//! - Tool execution via native host
//! - Cancellation and timeout handling

use crate::{
    AgentLoopConfig, AgentLoopError, ProviderKind, ProviderRouter, ProviderRouterError,
    RuntimeState, RuntimeStateMachine, SessionManager, SessionManagerError, SessionRecord,
    SessionState, TaskRecord, TaskState,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use thiserror::Error;
use tokio::sync::{mpsc, RwLock};
use tokio::time::timeout;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Agent loop configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLoopConfig {
    /// Maximum concurrent sessions.
    pub max_concurrent_sessions: usize,
    /// Turn timeout.
    pub turn_timeout: Duration,
    /// Stream chunk size.
    pub stream_chunk_size: usize,
    /// Enable tool execution.
    pub enable_tools: bool,
    /// Maximum tool call depth.
    pub max_tool_depth: usize,
}

/// Agent loop errors.
#[derive(Debug, Error)]
pub enum AgentLoopError {
    #[error("Session error: {0}")]
    Session(#[from] SessionManagerError),
    #[error("Provider routing error: {0}")]
    Provider(#[from] ProviderRouterError),
    #[error("Session not found: {0}")]
    SessionNotFound(String),
    #[error("Session in invalid state: {0}")]
    InvalidSessionState(String),
    #[error("Turn timeout")]
    TurnTimeout,
    #[error("Max tool depth exceeded")]
    MaxToolDepthExceeded,
    #[error("Tool execution error: {0}")]
    ToolExecution(String),
    #[error("Provider error: {0}")]
    ProviderError(String),
    #[error("Cancellation requested")]
    Cancelled,
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub type AgentLoopResult<T> = std::result::Result<T, AgentLoopError>;

/// Agent command from IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentCommand {
    StartSession {
        session_id: String,
        provider_connection_id: Option<String>,
        model_id: Option<String>,
    },
    SendMessage {
        session_id: String,
        content: String,
        attachments: Vec<Attachment>,
    },
    CancelOperation {
        session_id: String,
        operation_id: String,
    },
    GetSessionStatus {
        session_id: String,
    },
    ListSessions {
        limit: Option<usize>,
        offset: Option<usize>,
    },
    ResumeSession {
        session_id: String,
    },
    GetProviderStatus,
    SwitchProvider {
        session_id: String,
        provider_connection_id: String,
    },
}

/// Attachment for messages.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub path: Option<String>,
}

/// Agent response to IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentResponse {
    SessionStarted {
        session_id: String,
    },
    MessageAcknowledged {
        message_id: String,
    },
    OperationCancelled {
        operation_id: String,
    },
    SessionStatus {
        session_id: String,
        status: SessionStatus,
    },
    SessionList {
        sessions: Vec<SessionSummary>,
    },
    ProviderStatus {
        providers: Vec<ProviderStatus>,
    },
    ProviderSwitched {
        session_id: String,
        provider_connection_id: String,
    },
    Error {
        code: String,
        message: String,
    },
}

/// Session status for responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatus {
    pub session_id: String,
    pub state: SessionState,
    pub provider_connection_id: Option<String>,
    pub model_id: Option<String>,
    pub message_count: usize,
    pub last_activity: SystemTime,
}

/// Session summary for listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub session_id: String,
    pub title: Option<String>,
    pub state: SessionState,
    pub created_at: SystemTime,
    pub updated_at: SystemTime,
}

/// Provider status summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStatus {
    pub connection_id: String,
    pub provider_kind: ProviderKind,
    pub status: ProviderConnectionStatus,
    pub is_default: bool,
}

/// Provider connection status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderConnectionStatus {
    Connected,
    Disconnected,
    Authenticating,
    Error(String),
}

/// Turn state for the agent loop.
#[derive(Debug, Clone)]
struct TurnState {
    session_id: String,
    operation_id: String,
    cancelled: bool,
    tool_depth: usize,
    started_at: SystemTime,
}

/// Agent loop instance.
pub struct AgentLoop {
    config: AgentLoopConfig,
    session_manager: Arc<SessionManager>,
    provider_router: Arc<ProviderRouter>,
    state_machine: Arc<RuntimeStateMachine>,
    event_tx: mpsc::UnboundedSender<AgentEvent>,
    active_turns: RwLock<HashMap<String, TurnState>>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

/// Agent events for streaming to clients.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentEvent {
    SessionStarted {
        session_id: String,
    },
    SessionStateChanged {
        session_id: String,
        state: SessionState,
    },
    MessageStarted {
        session_id: String,
        message_id: String,
    },
    MessageChunk {
        session_id: String,
        message_id: String,
        chunk: String,
    },
    MessageCompleted {
        session_id: String,
        message_id: String,
    },
    ToolCallStarted {
        session_id: String,
        tool_id: String,
        tool_name: String,
    },
    ToolCallCompleted {
        session_id: String,
        tool_id: String,
        result: serde_json::Value,
    },
    ToolCallFailed {
        session_id: String,
        tool_id: String,
        error: String,
    },
    TurnCompleted {
        session_id: String,
    },
    TurnFailed {
        session_id: String,
        error: String,
    },
    OperationCancelled {
        session_id: String,
        operation_id: String,
    },
    ProviderStatusChanged {
        connection_id: String,
        status: ProviderConnectionStatus,
    },
}

impl AgentLoop {
    /// Create a new agent loop.
    pub async fn new(
        session_manager: Arc<SessionManager>,
        provider_router: Arc<ProviderRouter>,
        state_machine: Arc<RuntimeStateMachine>,
        config: AgentLoopConfig,
    ) -> AgentLoopResult<Self> {
        let (event_tx, _event_rx) = mpsc::unbounded_channel();

        Ok(Self {
            config,
            session_manager,
            provider_router,
            state_machine,
            event_tx,
            active_turns: RwLock::new(HashMap::new()),
            shutdown_tx: None,
        })
    }

    /// Start the agent loop.
    pub async fn start(&self) -> AgentLoopResult<()> {
        info!("Agent loop started");
        Ok(())
    }

    /// Stop the agent loop.
    pub async fn stop(&self) -> AgentLoopResult<()> {
        // Cancel all active turns
        let mut turns = self.active_turns.write().await;
        for (_, turn) in turns.drain() {
            turn.cancelled = true;
        }
        info!("Agent loop stopped");
        Ok(())
    }

    /// Handle a command from IPC.
    pub async fn handle_command(&self, command: AgentCommand) -> AgentResponse {
        match command {
            AgentCommand::StartSession { session_id, provider_connection_id, model_id } => {
                self.handle_start_session(session_id, provider_connection_id, model_id).await
            }
            AgentCommand::SendMessage { session_id, content, attachments } => {
                self.handle_send_message(session_id, content, attachments).await
            }
            AgentCommand::CancelOperation { session_id, operation_id } => {
                self.handle_cancel_operation(session_id, operation_id).await
            }
            AgentCommand::GetSessionStatus { session_id } => {
                self.handle_get_session_status(session_id).await
            }
            AgentCommand::ListSessions { limit, offset } => {
                self.handle_list_sessions(limit, offset).await
            }
            AgentCommand::ResumeSession { session_id } => {
                self.handle_resume_session(session_id).await
            }
            AgentCommand::GetProviderStatus => {
                self.handle_get_provider_status().await
            }
            AgentCommand::SwitchProvider { session_id, provider_connection_id } => {
                self.handle_switch_provider(session_id, provider_connection_id).await
            }
        }
    }

    /// Handle start session command.
    async fn handle_start_session(
        &self,
        session_id: String,
        provider_connection_id: Option<String>,
        model_id: Option<String>,
    ) -> AgentResponse {
        // Check if session exists
        match self.session_manager.get_session(&session_id).await {
            Ok(mut session) => {
                if session.state != SessionState::Created {
                    return AgentResponse::Error {
                        code: "INVALID_STATE".to_string(),
                        message: format!("Session already started: {:?}", session.state),
                    };
                }
                session.provider_connection_id = provider_connection_id;
                session.model_id = model_id;
                session.state = SessionState::Running;
                self.session_manager.update_session_state(&session_id, SessionState::Running).await.ok();
                self.session_manager.update_session_metadata(&session_id, serde_json::json!({
                    "provider_connection_id": session.provider_connection_id,
                    "model_id": session.model_id,
                })).await.ok();

                self.emit_event(AgentEvent::SessionStarted { session_id: session_id.clone() }).await;

                AgentResponse::SessionStarted { session_id }
            }
            Err(_) => AgentResponse::Error {
                code: "SESSION_NOT_FOUND".to_string(),
                message: format!("Session not found: {}", session_id),
            },
        }
    }

    /// Handle send message command.
    async fn handle_send_message(
        &self,
        session_id: String,
        content: String,
        attachments: Vec<Attachment>,
    ) -> AgentResponse {
        let operation_id = Uuid::new_v4().to_string();

        // Check session exists and is in valid state
        let session = match self.session_manager.get_session(&session_id).await {
            Ok(s) if s.state == SessionState::Running || s.state == SessionState::WaitingForInput => s,
            Ok(_) => return AgentResponse::Error {
                code: "INVALID_STATE".to_string(),
                message: "Session not in running state".to_string(),
            },
            Err(_) => return AgentResponse::Error {
                code: "SESSION_NOT_FOUND".to_string(),
                message: format!("Session not found: {}", session_id),
            },
        };

        // Check concurrent session limit
        let active_count = self.session_manager.active_session_count().await;
        if active_count >= self.config.max_concurrent_sessions {
            return AgentResponse::Error {
                code: "MAX_SESSIONS".to_string(),
                message: "Maximum concurrent sessions reached".to_string(),
            };
        }

        // Register active turn
        let turn = TurnState {
            session_id: session_id.clone(),
            operation_id: operation_id.clone(),
            cancelled: false,
            tool_depth: 0,
            started_at: SystemTime::now(),
        };
        self.active_turns.write().await.insert(operation_id.clone(), turn);

        // Add user message
        let message_id = Uuid::new_v4().to_string();
        self.session_manager.add_message(
            &session_id,
            crate::session::MessageRole::User,
            content,
            attachments.into_iter().map(|a| serde_json::to_value(a).unwrap()).collect(),
            None,
            session.model_id.clone(),
            None,
            None,
        ).await.ok();

        self.emit_event(AgentEvent::MessageStarted {
            session_id: session_id.clone(),
            message_id: message_id.clone(),
        }).await;

        // Process turn in background
        let session_manager = self.session_manager.clone();
        let provider_router = self.provider_router.clone();
        let state_machine = self.state_machine.clone();
        let event_tx = self.event_tx.clone();
        let active_turns = self.active_turns.clone();
        let config = self.config.clone();
        let session_id_clone = session_id.clone();
        let operation_id_clone = operation_id.clone();

        tokio::spawn(async move {
            let result = Self::process_turn(
                session_id_clone,
                operation_id_clone,
                session_manager,
                provider_router,
                state_machine,
                event_tx,
                active_turns,
                config,
            ).await;

            if let Err(e) = result {
                error!("Turn processing error: {}", e);
            }
        });

        AgentResponse::MessageAcknowledged { message_id }
    }

    /// Process a conversation turn.
    async fn process_turn(
        session_id: String,
        operation_id: String,
        session_manager: Arc<SessionManager>,
        provider_router: Arc<ProviderRouter>,
        state_machine: Arc<RuntimeStateMachine>,
        event_tx: mpsc::UnboundedSender<AgentEvent>,
        active_turns: Arc<RwLock<HashMap<String, TurnState>>>,
        config: AgentLoopConfig,
    ) -> AgentLoopResult<()> {
        // Check for cancellation
        {
            let turns = active_turns.read().await;
            if turns
                .get(&operation_id)
                .map(|t| t.cancelled)
                .unwrap_or(false)
            {
                return Err(AgentLoopError::Cancelled);
            }
        }

        // Check runtime state
        if state_machine.current_state().await != RuntimeState::Healthy {
            return Err(AgentLoopError::ProviderError(
                "Runtime not healthy".to_string(),
            ));
        }

        // Resolve provider
        let (connection_id, provider_kind, provider_config, credential) =
            provider_router.resolve_provider(None).await?;

        // For now, simulate provider response
        // In a real implementation, this would call the actual provider API
        let response_content = format!(
            "Response from {:?} for session {}",
            provider_kind, session_id
        );

        // Add assistant message
        let message_id = Uuid::new_v4().to_string();
        session_manager
            .add_message(
                &session_id,
                crate::session::MessageRole::Assistant,
                response_content,
                vec![],
                Some(provider_kind),
                provider_config.model_id(),
                None,
                None,
            )
            .await?;

        // Emit message chunk events (simulated streaming)
        let chunks = ["Response ", "from ", "{:?} ", "for ", "session ", "{}"];
        for chunk in chunks {
            if active_turns
                .read()
                .await
                .get(&operation_id)
                .map(|t| t.cancelled)
                .unwrap_or(false)
            {
                return Err(AgentLoopError::Cancelled);
            }
            let formatted = chunk
                .replace("{:?}", &format!("{:?}", provider_kind))
                .replace("{}", &session_id);
            event_tx
                .send(AgentEvent::MessageChunk {
                    session_id: session_id.clone(),
                    message_id: message_id.clone(),
                    chunk: formatted,
                })
                .ok();
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        event_tx
            .send(AgentEvent::MessageCompleted {
                session_id: session_id.clone(),
                message_id: message_id.clone(),
            })
            .ok();

        event_tx
            .send(AgentEvent::TurnCompleted {
                session_id: session_id.clone(),
            })
            .ok();

        // Update session state
        session_manager
            .update_session_state(&session_id, SessionState::WaitingForInput)
            .await?;
        session_manager.mark_inactive(&session_id).await;

        // Clean up turn
        active_turns.write().await.remove(&operation_id);

        Ok(())
    }

    /// Handle cancel operation command.
    async fn handle_cancel_operation(
        &self,
        session_id: String,
        operation_id: String,
    ) -> AgentResponse {
        let mut turns = self.active_turns.write().await;
        if let Some(turn) = turns.get_mut(&operation_id) {
            turn.cancelled = true;
            self.emit_event(AgentEvent::OperationCancelled {
                session_id: session_id.clone(),
                operation_id: operation_id.clone(),
            })
            .await;
            AgentResponse::OperationCancelled { operation_id }
        } else {
            AgentResponse::Error {
                code: "OPERATION_NOT_FOUND".to_string(),
                message: format!("Operation not found: {}", operation_id),
            }
        }
    }

    /// Handle get session status command.
    async fn handle_get_session_status(&self, session_id: String) -> AgentResponse {
        match self.session_manager.get_session(&session_id).await {
            Ok(session) => AgentResponse::SessionStatus {
                session_id: session.session_id.clone(),
                status: SessionStatus {
                    session_id: session.session_id,
                    state: session.state,
                    provider_connection_id: session.provider_connection_id,
                    model_id: session.model_id,
                    message_count: session.message_count as usize,
                    last_activity: session.updated_at,
                },
            },
            Err(_) => AgentResponse::Error {
                code: "SESSION_NOT_FOUND".to_string(),
                message: format!("Session not found: {}", session_id),
            },
        }
    }

    /// Handle list sessions command.
    async fn handle_list_sessions(
        &self,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> AgentResponse {
        // For now, return empty list - would need profile_id
        AgentResponse::SessionList { sessions: vec![] }
    }

    /// Handle resume session command.
    async fn handle_resume_session(&self, session_id: String) -> AgentResponse {
        match self.session_manager.get_session(&session_id).await {
            Ok(session) if session.state == SessionState::WaitingForInput => {
                self.session_manager
                    .update_session_state(&session_id, SessionState::Running)
                    .await
                    .ok();
                self.emit_event(AgentEvent::SessionStateChanged {
                    session_id: session_id.clone(),
                    state: SessionState::Running,
                })
                .await;
                AgentResponse::SessionStatus {
                    session_id: session.session_id.clone(),
                    status: SessionStatus {
                        session_id: session.session_id,
                        state: SessionState::Running,
                        provider_connection_id: session.provider_connection_id,
                        model_id: session.model_id,
                        message_count: session.message_count as usize,
                        last_activity: session.updated_at,
                    },
                }
            }
            Ok(_) => AgentResponse::Error {
                code: "INVALID_STATE".to_string(),
                message: "Session not in waiting state".to_string(),
            },
            Err(_) => AgentResponse::Error {
                code: "SESSION_NOT_FOUND".to_string(),
                message: format!("Session not found: {}", session_id),
            },
        }
    }

    /// Handle get provider status command.
    async fn handle_get_provider_status(&self) -> AgentResponse {
        match self.provider_router.get_all_status().await {
            Ok(providers) => AgentResponse::ProviderStatus { providers },
            Err(e) => AgentResponse::Error {
                code: "PROVIDER_ERROR".to_string(),
                message: e.to_string(),
            },
        }
    }

    /// Handle switch provider command.
    async fn handle_switch_provider(
        &self,
        session_id: String,
        provider_connection_id: String,
    ) -> AgentResponse {
        match self.session_manager.get_session(&session_id).await {
            Ok(mut session) => {
                session.provider_connection_id = Some(provider_connection_id.clone());
                self.session_manager.update_session_metadata(&session_id, serde_json::json!({
                    "provider_connection_id": provider_connection_id,
                })).await.ok();

                self.emit_event(AgentEvent::SessionStateChanged {
                    session_id: session_id.clone(),
                    state: session.state,
                }).await;

                AgentResponse::ProviderSwitched {
                    session_id,
                    provider_connection_id,
                }
            }
            Err(_) => AgentResponse::Error {
                code: "SESSION_NOT_FOUND".to_string(),
                message: format!("Session not found: {}", session_id),
            },
        }
    }

    /// Emit an event to connected clients.
    async fn emit_event(&self, event: AgentEvent) {
        let _ = self.event_tx.send(event);
    }

    /// Get event receiver for IPC server.
    pub fn event_receiver(&self) -> mpsc::UnboundedReceiver<AgentEvent> {
        // This would need a different design - for now return empty
        let (_tx, rx) = mpsc::unbounded_channel();
        rx
    }
}

impl Default for AgentLoopConfig {
    fn default() -> Self {
        Self {
            max_concurrent_sessions: 10,
            turn_timeout: Duration::from_secs(300),
            stream_chunk_size: 1024,
            enable_tools: true,
            max_tool_depth: 5,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_loop_config_default() {
        let config = AgentLoopConfig::default();
        assert_eq!(config.max_concurrent_sessions, 10);
        assert_eq!(config.turn_timeout, Duration::from_secs(300));
        assert!(config.enable_tools);
    }

    #[test]
    fn test_session_state_transitions() {
        assert_eq!(SessionState::Created.as_str(), "created");
        assert_eq!(SessionState::from_str("running"), SessionState::Running);
    }
}