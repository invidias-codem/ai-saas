// Agent Runtime module — re-exports from lattice_agent_runtime crate
// and provides Tauri command handlers.

use lattice_agent_runtime::{
    AgentLoopConfig, AgentRuntimeConfig, ProviderRouter, RuntimeSupervisor,
    SessionConfig, SessionManager,
    agent_health, agent_start, agent_status, agent_stop,
};

pub use lattice_agent_runtime::{
    AgentLoopConfig, AgentRuntimeConfig, ProviderRouter, RuntimeSupervisor,
    SessionConfig, SessionManager,
    agent_health, agent_start, agent_status, agent_stop,
};