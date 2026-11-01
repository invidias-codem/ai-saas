// Agent Runtime module — re-exports from lattice_agent_runtime crate
// and provides Tauri command handlers.

use lattice_agent_runtime::{
    agent_health, agent_start, agent_status, agent_stop, AgentLoopConfig, AgentRuntimeConfig,
    ProviderRouter, RuntimeSupervisor, SessionConfig, SessionManager,
};

pub use lattice_agent_runtime::{
    agent_health, agent_start, agent_status, agent_stop, AgentLoopConfig, AgentRuntimeConfig,
    ProviderRouter, RuntimeSupervisor, SessionConfig, SessionManager,
};
