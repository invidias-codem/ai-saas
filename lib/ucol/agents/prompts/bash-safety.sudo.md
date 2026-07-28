# Bash Safety Constraints
# Runtime binding: POSIX shell execution via lattice_tool / lattice_prompt / lattice_memory
# Loading order: always load with CLI constraints; required before tool execution

BashSafety {
  identity: "Lattice OS shell execution policy"
  version: "1.0"

  context {
    shell: "POSIX-compliant bash"
    privileges: "runs as current UID only; cannot exceed host user permissions"
    trust_model: "local-first execution unless tool routing requires API"
    destructive_gate: "lattice_guard with interactive confirmation"
  }

  constraints {
    # File operations
    - Use native bash primitives for filesystem operations
    - Use cat -n for file reads; provide exact line numbers
    - Use ed -s for edits; emit precise line-addressed ed scripts
    - Never emit full-file rewrites when only lines changed
    - Use heredoc only for new files, never overlays on existing files

    # Process operations
    - Background long-running commands only via lattice_tool FIFO capture
    - Always capture stdout and stderr independently
    - Never leave background processes orphaned after response complete
    - Surface nonzero exit codes immediately with command echo

    # Network operations
    - Use curl for HTTP; always set --max-time and --retry >= 3
    - Never expose Authorization header values in logs or tool output
    - Prefer /api/cli/stream for LLM; /api/memory/cli for memory
    - Do not call external analytics endpoints from the orchestrator

    # Safety invariants
    - Destructive patterns MUST trigger lattice_guard before execution
    - chmod 777, chown, and filesystem mutation outside workspace require confirmation
    - Multiple destructive ops chained with && require per-command verification
    - Interactive prompts are mandatory when stdin is a TTY; fail closed otherwise
  }

  destructive_command_patterns {
    block_immediately {
      - "rm -rf *" or deeper recursive delete patterns
      - "drop database" or any DDL without explicit memory backup
      - "git push --force" or "git reset --hard"
      - "mv /* " or moves across filesystem roots
      - "dd" or block device writes
    }
    require_confirmation {
      - "chmod -R 777"
      - "chown -R"
      - "truncate -s 0" on production-like paths
      - "git push --force-with-lease" instead of raw force
      - "rm -r" with no -i fallback
    }
  }

  tool_routing_preference {
    prefer_local_when {
      - Data already exists on disk
      - Operation is filesystem-only
      - Result is smaller than the API round-trip cost
    }
    prefer_api_when {
      - Memory retrieval from Supabase
      - LLM generation
      - Cross-session context from other users or workspaces
    }
    prefer_memory_first_when {
      - Context window is near 75%+ utilization
      - Query contains temporal or historical qualifiers
      - User references prior sessions or facts
    }
  }
}
