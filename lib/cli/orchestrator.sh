#!/usr/bin/env bash
# Lattice OS - Bash Orchestrator
# Usage: lattice_orchestrator.sh [subcommand]
#   subcommands: prompt, tool, memory, guard, compact

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
LATTICE_HOME="${LATTICE_HOME:-$HOME/.lattice}"
LATTICE_API="${LATTICE_API_URL:-http://localhost:3000}"
LATTICE_DB="$LATTICE_HOME/memory.db"
LATTICE_SETTINGS="$LATTICE_HOME/settings"
MEMORY_CACHE_TABLE="lattice_memory_cache"

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()  { printf '\033[1;34m[lattice]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[lattice]\033[0m %s\n' "$*" >&2; }
error() { printf '\033[1;31m[lattice]\033[0m %s\n' "$*" >&2; }

is_destructive() {
  local cmd="$1"
  case "$cmd" in
    rm\ -rf*|rm\ -fr*|rm\ -r*|rm\ -f*|rm\ *)
      return 0 ;;
    drop\ database*|drop\ table*|drop\ *)
      return 0 ;;
    git\ push\ --force|git\ push\ -f|git\ reset\ --hard)
      return 0 ;;
    mv\ *\ /|mv\ /*\ *)
      return 0 ;;
    dd\ *|dd)
      return 0 ;;
    *)
      return 1 ;;
  esac
}

ensure_lattice_home() {
  mkdir -p "$LATTICE_HOME"
}

# ─── Token Auth ────────────────────────────────────────────────────────────────
LATTICE_TOKEN=""
if [[ -f "$LATTICE_HOME/token" ]]; then
  LATTICE_TOKEN=$(<"$LATTICE_HOME/token")
  LATTICE_TOKEN="${LATTICE_TOKEN#"${LATTICE_TOKEN%%[![:space:]]*}"}"
  LATTICE_TOKEN="${LATTICE_TOKEN%"${LATTICE_TOKEN##*[![:space:]]}"}"
fi

# ─── Prompt primitive ─────────────────────────────────────────────────────────
# Usage: lattice_prompt <user_input>
# Streams SSE from /api/cli/stream and writes text payloads to /dev/tty.
lattice_prompt() {
  local user_input="${1:-}"
  if [[ -z "$user_input" ]]; then
    warn "lattice_prompt: empty input"
    return 1
  fi

  ensure_lattice_home
  local tmpdir
  tmpdir=$(mktemp -d)
  local url="${LATTICE_API}/api/cli/stream"
  local payload
  payload=$(jq -cn --arg text "$user_input" '{messages: [{role: "user", text: $text}], options: {}}')

  # Stream SSE and parse event/data lines
  local tty_target="/dev/tty"
  if [[ ! -t 1 ]]; then
    tty_target="/dev/stdout"
  fi

  curl -sS -N \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-lattice-user-id: ${LATTICE_USER_ID:-local}" \
    ${LATTICE_TOKEN:+-H "Authorization: Bearer $LATTICE_TOKEN"} \
    -d "$payload" \
    "$url" \
    | while IFS= read -r line; do
        case "$line" in
          '')
            continue
            ;;
          event:*)
            continue
            ;;
          data:*)
            raw="${line#data: }"
            if [[ "$raw" == \{* ]]; then
              continue
            fi
            printf '%s' "$raw" > "$tty_target"
            ;;
        esac
      done
}

# ─── Tool primitive ───────────────────────────────────────────────────────────
# Usage: lattice_tool <command_string>
# Executes the command in a backgrounded subprocess with stdout/stderr captured
# via FIFOs, and returns structured JSON.
lattice_tool() {
  local cmd="${1:-}"
  if [[ -z "$cmd" ]]; then
    error "lattice_tool: missing command"
    lattice_tool_result "" "error" "missing command"
    return 1
  fi

  lattice_guard "$cmd" || {
    lattice_tool_result "$cmd" "denied" "destructive command blocked by guard"
    return 2
  }

  ensure_lattice_home
  local fifo_out fifo_err
  fifo_out=$(mktemp -u)
  fifo_err=$(mktemp -u)

  if ! mkfifo "$fifo_out" "$fifo_err" 2>/dev/null; then
    fifo_out=$(mktemp)
    fifo_err=$(mktemp)
  fi

  ( eval "$cmd" > "$fifo_out" 2> "$fifo_err"; echo $? > "$fifo_out.exit" ) &
  local pid=$!

  # Read both FIFOs in background subshells to prevent deadlock
  cat "$fifo_out" > "$fifo_out.buf" 2>/dev/null &
  local out_reader=$!
  cat "$fifo_err" > "$fifo_err.buf" 2>/dev/null &
  local err_reader=$!

  wait "$out_reader" "$err_reader" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true

  local stdout_data stderr_data exit_code
  stdout_data=$(cat "$fifo_out.buf" 2>/dev/null || true)
  stderr_data=$(cat "$fifo_err.buf" 2>/dev/null || true)
  exit_code=$(cat "$fifo_out.exit" 2>/dev/null || echo 0)

  rm -f "$fifo_out" "$fifo_err" "$fifo_out.buf" "$fifo_err.buf" "$fifo_out.exit" 2>/dev/null || true

  lattice_tool_result "$cmd" "exit:$exit_code" "$stdout_data" "$stderr_data"
  return 0
}

lattice_tool_result() {
  local cmd="$1" status="$2" stdout="${3:-}" stderr="${4:-}"
  jq -cn \
    --arg cmd "$cmd" \
    --arg status "$status" \
    --arg stdout "$stdout" \
    --arg stderr "$stderr" \
    '{tool_call: {command: $cmd, status: $status, stdout: $stdout, stderr: $stderr}}'
}

# ─── Memory primitive ─────────────────────────────────────────────────────────
# Usage: lattice_memory <query>
# Queries local sqlite3 cache first; falls back to remote API on cache miss.
lattice_memory() {
  local query="${1:-}"
  if [[ -z "$query" ]]; then
    warn "lattice_memory: empty query"
    return 1
  fi

  ensure_lattice_home

  if [[ ! -f "$LATTICE_DB" ]]; then
    sqlite3 "$LATTICE_DB" "CREATE TABLE IF NOT EXISTS $MEMORY_CACHE_TABLE (key TEXT PRIMARY KEY, payload TEXT, fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
  fi

  # Use parameterized sqlite lookup via stdin to avoid shell quoting issues
  local cached
  cached=$(printf '.mode json\nSELECT payload FROM %s WHERE key = ? ORDER BY fetched_at DESC LIMIT 1;\n' "$MEMORY_CACHE_TABLE" | sqlite3 -cmd "$(printf '%s' "$query" | sqlite3 :memory: 'SELECT quote(?);' 2>/dev/null || true)" "$LATTICE_DB" 2>/dev/null || true)

  if [[ -n "$cached" ]]; then
    printf '%s\n' "$cached"
    return 0
  fi

  # Network fallback
  local api_payload
  api_payload=$(curl -sS -m 5 \
    "${LATTICE_API}/api/memory/cli?q=$(printf '%s' "$query" | jq -sRr @uri)" \
    -H "x-lattice-user-id: ${LATTICE_USER_ID:-local}" \
    ${LATTICE_TOKEN:+-H "Authorization: Bearer $LATTICE_TOKEN"} 2>/dev/null || true)

  if [[ -n "$api_payload" ]]; then
    printf '.mode json\nINSERT OR REPLACE INTO %s (key, payload) VALUES (json(?));\n' "$MEMORY_CACHE_TABLE" | sqlite3 "$LATTICE_DB" 2>/dev/null || true
    printf '%s\n' "${api_payload}"
  fi

  return 0
}

# ─── Guard primitive ──────────────────────────────────────────────────────────
# Usage: lattice_guard <command_string>
# Returns 0 if command is safe; 1 if destructive and blocked.
lattice_guard() {
  local cmd="${1:-}"
  if [[ -z "$cmd" ]]; then
    return 1
  fi

  if ! is_destructive "$cmd"; then
    return 0
  fi

  if [[ -t 0 ]]; then
    printf '\033[1;31m[lattice-guard]\033[0m Destructive command detected:\n  %s\n' "$cmd" >&2
    printf 'Proceed? [y/N] ' >&2
    read -r confirm
    [[ "$confirm" =~ ^[Yy]$ ]]
  else
    warn "lattice_guard: blocked non-interactive destructive command: $cmd"
    return 1
  fi
}

# ─── ed helpers ────────────────────────────────────────────────────────────────
# Usage: lattice_ed_read <file> <start_line> <end_line>
lattice_ed_read() {
  local file="$1" start="${2:-}" end="${3:-}"
  if [[ ! -f "$file" ]]; then
    error "lattice_ed_read: file not found: $file"
    return 1
  fi
  if [[ -n "$start" && -n "$end" ]]; then
    ed -s "$file" <<EOF
${start},${end}p
q
EOF
  else
    cat -n "$file"
  fi
}

# Usage: lattice_ed_replace <file> <old_string> <new_string>
lattice_ed_replace() {
  local file="$1" old="$2" new="$3"
  if [[ ! -f "$file" ]]; then
    error "lattice_ed_replace: file not found: $file"
    return 1
  fi
  if ! ed -s "$file" 1>/dev/null 2>&1 <<EOF
,s/${old}/${new}/g
w
q
EOF
  then
    warn "lattice_ed_replace: ed substitution failed: $old -> $new"
    return 1
  fi
}

# ─── Compaction primitive ──────────────────────────────────────────────────────
# Usage: lattice_compact <current_context_file> <summary_output_file>
lattice_compact() {
  local ctx_file="${1:-/tmp/lattice_context.json}"
  local summary_file="${2:-/tmp/lattice_summary.json}"

  if [[ ! -f "$ctx_file" ]]; then
    warn "lattice_compact: context file missing"
    return 1
  fi

  local prompt
  prompt=$(printf 'Summarize the following conversation context in under 200 tokens, preserving goals, current state, and pending tasks.\n\n%s' "$(cat "$ctx_file")")

  local summary
  summary=$(lattice_prompt "$prompt" 2>/dev/null || echo '{"summary":"compaction failed"}')

  printf '%s\n' "$summary" > "$summary_file"
  info "Context compacted -> $summary_file"
}

# ─── Main dispatcher ──────────────────────────────────────────────────────────
case "${1:-}" in
  prompt) shift; lattice_prompt "$@" ;;
  tool)   shift; lattice_tool "$@" ;;
  memory) shift; lattice_memory "$@" ;;
  guard)  shift; lattice_guard "$@" ;;
  compact) shift; lattice_compact "$@" ;;
  ed-read) shift; lattice_ed_read "$@" ;;
  ed-replace) shift; lattice_ed_replace "$@" ;;
  *)
    if [[ $# -eq 0 ]]; then
      # Interactive mode
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        lattice_prompt "$line"
        printf '\n'
      done
      exit $?
    fi
    echo "Usage: $0 {prompt|tool|memory|guard|compact|ed-read|ed-replace} [args...]" >&2
    exit 1
    ;;
esac
