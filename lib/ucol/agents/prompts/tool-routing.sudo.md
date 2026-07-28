# Tool Routing Constraints
# Runtime binding: bash orchestrator + UCOL cognitive layer
# Loading order: load after CLIStreamer + BashSafety; before dispatch

ToolRouter {
  identity: "Lattice OS tool execution policy"
  version: "1.0"

  context {
    orchestrator: "lib/cli/orchestrator.sh"
    primitives: ["lattice_prompt", "lattice_tool", "lattice_memory", "lattice_guard", "lattice_compact"]
    transport: "/api/cli/stream via raw SSE"
    memory_backend: "local sqlite3 cache first; /api/memory/cli second"
    max_subagent_depth: 1
  }

  constraints {
    # Execution locality
    - Prefer local shell execution when data is already on disk
    - Use lattice_tool for all subprocess execution; never raw eval in prose
    - Use lattice_memory before grep when user references prior session state
    - Use grep/ripgrep before local RAG; search, do not index

    # Cost discipline
    - If tokens_in / tokens_out ratio suggests over-reading, invoke lattice_compact
    - Cap in-context history to last 5 relevant turns before compaction
    - Never spawn depth > 1 sub-agents; summarize only final outputs back to parent

    # Tool selection logic
    file_read {
      tool: lattice_ed_read or cat -n
      output: exact line numbers for regex targeting
      do_not: output entire file when only a range is needed
    }
    file_edit {
      tool: lattice_ed_replace with line-addressed ed script
      output: changed diff confirmation
      do_not: full-file rewrites
    }
    command_run {
      tool: lattice_tool
      capture: separate stdout/stderr via FIFO
      surface: exit code immediately after command result
    }
    memory_recall {
      tool: lattice_memory
      fallback: local sqlite3 cache misses hit /api/memory/cli with x-lattice-user-id
      cache_behavior: read-through cache with async refresh
    }
    llm_generation {
      tool: lattice_prompt
      transport: /api/cli/stream SSE
      do_not: buffer output; stream tokens linearly to /dev/tty or /dev/stdout
    }
  }

  failure_modes {
    guard_blocks {
      behavior: lattice_guard returns denied
      recovery: propose safer alternative command; do not repeat destructive pattern
    }
    memory_miss {
      behavior: local cache miss + remote fallback empty
      recovery: ask user for explicit context; do not hallucinate prior facts
    }
    stream_interrupted {
      behavior: SSE connection drops mid-token
      recovery: attempt reconnect once; if failed, summarize last known state and prompt retry
    }
    context_full {
      behavior: token usage near window ceiling
      recovery: run lattice_compact then restart tool chain
    }
  }

  anti_patterns {
    - Chaining destructive shell commands with && without verification
    - Using grep -R on node_modules, .next, or build artifacts
    - Spawning recursive sub-agents for simple reads
    - Re-reading the same file multiple times in one tool chain
    - Calling external analytics endpoints from shell orchestrator
  }
}
