#!/usr/bin/env bash
# Compatibility entry point: no independent or divergent target mapping.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/desktop/build-sidecar.mjs" "$@"
