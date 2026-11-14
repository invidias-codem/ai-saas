//! Tauri command wrappers around the library runtime functions.
//! The `#[tauri::command]` attribute lives at the app boundary so
//! `tauri::generate_handler!` can register them; the library keeps the
//! plain functions (no command attribute) so it compiles standalone.

use std::sync::Arc;
use tauri::State;

use lattice_agent_runtime::{RuntimeHealth, RuntimeStatusResponse};

#[tauri::command]
pub async fn agent_start(
    profile_id: String,
    channel: String,
    state: State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeStatusResponse, String> {
    state
        .start_runtime(profile_id, channel)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_stop(
    profile_id: String,
    state: State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeStatusResponse, String> {
    state
        .stop_runtime(profile_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_status(
    profile_id: String,
    state: State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeStatusResponse, String> {
    state
        .get_status(profile_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_health(
    profile_id: String,
    state: State<'_, Arc<RuntimeSupervisor>>,
) -> Result<RuntimeHealth, String> {
    state
        .get_health(profile_id)
        .await
        .map_err(|e| e.to_string())
}

pub use lattice_agent_runtime::{
    AgentLoopConfig, AgentRuntimeConfig, RuntimeSupervisor, SessionConfig,
};
