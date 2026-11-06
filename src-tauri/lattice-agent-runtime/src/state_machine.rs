//! Runtime state machine for the agent supervisor.

use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Runtime lifecycle states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum RuntimeState {
    /// Runtime is stopped and not initialized.
    Stopped,
    /// Runtime is starting up components.
    Starting,
    /// Runtime is healthy and operational.
    Healthy,
    /// Runtime has degraded functionality but is partially operational.
    Degraded,
    /// Runtime encountered a fatal error.
    Failed,
    /// Runtime is shutting down.
    Stopping,
}

impl RuntimeState {
    /// Check if this state allows transitions.
    pub fn can_transition_to(&self, target: RuntimeState) -> bool {
        use RuntimeState::*;
        matches!(
            (self, target),
            (Stopped, Starting)
                | (Starting, Healthy)
                | (Starting, Failed)
                | (Healthy, Degraded)
                | (Healthy, Stopping)
                | (Healthy, Failed)
                | (Degraded, Healthy)
                | (Degraded, Stopping)
                | (Degraded, Failed)
                | (Stopping, Stopped)
                | (Stopping, Failed)
                | (Failed, Stopping) // retry
        )
    }
}

/// State machine errors.
#[derive(Debug, Error)]
pub enum StateTransitionError {
    #[error("Invalid state transition: {from:?} -> {to:?}")]
    InvalidTransition {
        from: RuntimeState,
        to: RuntimeState,
    },
    #[error("State machine is locked")]
    Locked,
    #[error("Timeout waiting for state transition")]
    Timeout,
}

/// Runtime state machine with async transitions.
pub struct RuntimeStateMachine {
    state: RwLock<RuntimeState>,
    transition_lock: Arc<tokio::sync::Mutex<()>>,
}

impl RuntimeStateMachine {
    /// Create a new state machine in the Stopped state.
    pub fn new() -> Self {
        Self {
            state: RwLock::new(RuntimeState::Stopped),
            transition_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    /// Get the current state.
    pub async fn current_state(&self) -> RuntimeState {
        *self.state.read().await
    }

    /// Transition to a new state with validation.
    pub async fn transition_to(&self, target: RuntimeState) -> Result<(), StateTransitionError> {
        // Acquire transition lock to serialize state changes
        let _guard = self.transition_lock.lock().await;

        let current = *self.state.read().await;

        if !current.can_transition_to(target) {
            warn!("Invalid state transition: {:?} -> {:?}", current, target);
            return Err(StateTransitionError::InvalidTransition {
                from: current,
                to: target,
            });
        }

        info!("State transition: {:?} -> {:?}", current, target);

        // Perform the transition
        *self.state.write().await = target;

        debug!("State transition complete: {:?}", target);
        Ok(())
    }

    /// Transition with a timeout.
    pub async fn transition_to_timeout(
        &self,
        target: RuntimeState,
        timeout: Duration,
    ) -> Result<(), StateTransitionError> {
        tokio::time::timeout(timeout, self.transition_to(target))
            .await
            .map_err(|_| StateTransitionError::Timeout)?
    }

    /// Wait for a specific state with timeout.
    pub async fn wait_for_state(
        &self,
        target: RuntimeState,
        timeout: Duration,
    ) -> Result<(), StateTransitionError> {
        let start = std::time::Instant::now();
        while start.elapsed() < timeout {
            if self.current_state().await == target {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        Err(StateTransitionError::Timeout)
    }
}

impl Default for RuntimeStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_valid_transitions() {
        let sm = RuntimeStateMachine::new();
        assert_eq!(sm.current_state().await, RuntimeState::Stopped);

        sm.transition_to(RuntimeState::Starting).await.unwrap();
        assert_eq!(sm.current_state().await, RuntimeState::Starting);

        sm.transition_to(RuntimeState::Healthy).await.unwrap();
        assert_eq!(sm.current_state().await, RuntimeState::Healthy);

        sm.transition_to(RuntimeState::Stopping).await.unwrap();
        assert_eq!(sm.current_state().await, RuntimeState::Stopping);

        sm.transition_to(RuntimeState::Stopped).await.unwrap();
        assert_eq!(sm.current_state().await, RuntimeState::Stopped);
    }

    #[tokio::test]
    async fn test_invalid_transition() {
        let sm = RuntimeStateMachine::new();
        // Can't go from Stopped directly to Healthy
        assert!(sm.transition_to(RuntimeState::Healthy).await.is_err());
    }

    #[tokio::test]
    async fn test_degraded_recovery() {
        let sm = RuntimeStateMachine::new();
        sm.transition_to(RuntimeState::Starting).await.unwrap();
        sm.transition_to(RuntimeState::Healthy).await.unwrap();
        sm.transition_to(RuntimeState::Degraded).await.unwrap();
        sm.transition_to(RuntimeState::Healthy).await.unwrap();
        assert_eq!(sm.current_state().await, RuntimeState::Healthy);
    }

    #[tokio::test]
    async fn test_failed_retry() {
        let sm = RuntimeStateMachine::new();
        sm.transition_to(RuntimeState::Starting).await.unwrap();
        sm.transition_to(RuntimeState::Failed).await.unwrap();
        sm.transition_to(RuntimeState::Stopping).await.unwrap();
        sm.transition_to(RuntimeState::Stopped).await.unwrap();
        sm.transition_to(RuntimeState::Starting).await.unwrap();
        assert_eq!(sm.current_state().await, RuntimeState::Starting);
    }
}
