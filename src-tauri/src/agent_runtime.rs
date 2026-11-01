// Agent Runtime module — re-exports from lattice_agent_runtime crate
// and provides Tauri command handlers.

use lattice_agent_runtime::{
    agent_start, agent_stop, agent_status, agent_health,
    AgentLoopConfig, AgentRuntimeConfig, ProviderRouter, RuntimeSupervisor,
    SessionConfig, SessionManager,
};

pub use lattice_agent_runtime::{
    agent_start, agent_stop, agent_status, agent_health,
    AgentLoopConfig, AgentRuntimeConfig, ProviderRouter, RuntimeSupervisor,
    SessionConfig, SessionManager,
};