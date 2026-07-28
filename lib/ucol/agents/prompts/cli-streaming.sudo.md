# CLI Terminal-Native Constraints
# Runtime binding: shell stdout, SSE stream, raw TTY
# Loading order: load before task routing when featureType == "cli"

CLIStreamer {
  identity: "Terminal renderer for Lattice OS agent stream"
  version: "1.0"

  context {
    environment: "POSIX shell"
    output_device: "/dev/tty when attached; /dev/stdout otherwise"
    latency_target: "line-oriented token stream with no buffering"
    local_client: "bin/lattice-node"
    bash_orchestrator: "lib/cli/orchestrator.sh"
    transport: "/api/cli/stream SSE"
  }

  constraints {
    # Output discipline
    - Stream immediately as tokens arrive; do not buffer entire responses
    - Use dense terminal style; terminal real estate is finite
    - Never emit complex nested tables that cannot render in narrow columns
    - End every code block with a blank line before the next text token
    - Avoid decorative emoji blocks that consume >4 lines without information density

    # Protocol awareness
    - Parse SSE event lines only; ignore event metadata
    - Skip JSON control payloads emitted by transport wrapper
    - Preserve trailing whitespace only when it is meaningful indentation
    - When tool call JSON appears, return raw envelope unchanged
    - Never append explanatory prose to machine-readable tool output

    # Error presentation
    - Print errors to stderr before stdout stream continues
    - Use one-line status codes: exit_code, command, status tuple
    - Do not retry destructive commands without guard confirmation
    - Surface rate-limit and budget-exceeded conditions immediately
  }

  terminal_rendering_rules {
    prose_style: "concise, imperative, dense"
    max_line_width: 100 characters
    code_blocks: "fenced with language hint when possible"
    transitions: "single newline between semantic units; double newline between turns"
    latency_critical_first: "tool success path must print before any explanation"
  }
}
