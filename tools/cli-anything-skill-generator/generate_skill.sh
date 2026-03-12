#!/usr/bin/env bash
# generate_skill.sh — Bash wrapper for generate_skill.py
#
# Usage:
#   ./generate_skill.sh <harness-dir>          # Generate SKILL.md for one harness
#   ./generate_skill.sh --all <base-dir>        # Generate for all harnesses in <base-dir>
#
# Examples:
#   ./generate_skill.sh ../agent-harnesses/gh/agent-harness
#   ./generate_skill.sh --all ../agent-harnesses

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="${SCRIPT_DIR}/generate_skill.py"

if [[ ! -f "${GENERATOR}" ]]; then
  echo "ERROR: generate_skill.py not found at ${GENERATOR}" >&2
  exit 1
fi

# ── --all mode: generate for every agent-harness subdir ──────────────────────
if [[ "${1:-}" == "--all" ]]; then
  BASE_DIR="${2:?Usage: $0 --all <base-dir>}"
  BASE_DIR="$(cd "${BASE_DIR}" && pwd)"
  echo "🚀 Generating SKILL.md for all harnesses in: ${BASE_DIR}"
  echo ""
  success=0
  fail=0
  for harness_dir in "${BASE_DIR}"/*/agent-harness; do
    if [[ -d "${harness_dir}" ]]; then
      if python3 "${GENERATOR}" --harness-dir "${harness_dir}"; then
        ((success++))
      else
        echo "  ❌ Failed: ${harness_dir}" >&2
        ((fail++))
      fi
    fi
  done
  echo ""
  echo "Done: ${success} succeeded, ${fail} failed."
  exit $(( fail > 0 ? 1 : 0 ))
fi

# ── Single harness mode ───────────────────────────────────────────────────────
HARNESS_DIR="${1:?Usage: $0 <harness-dir>}"
python3 "${GENERATOR}" --harness-dir "${HARNESS_DIR}"
