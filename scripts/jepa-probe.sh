#!/usr/bin/env bash
# JEPA WASM probe — bounded instrumentation run against a Vercel preview.
# Usage: ./scripts/jepa-probe.sh <preview-url>
# Captures cold + 3 warm runs, and the runtime/response signals called out
# in research/world-model/jepa-wasm-fallback-spec.md as kill criteria.

set -euo pipefail

URL="${1:?usage: $0 <preview-url>}"
PROBE="$URL/api/wasm-probe"

echo "== probe target: $PROBE"
echo "== capture started: $(date -u +%FT%TZ)"

# Cold probe (first request)
echo
echo "── cold run (t=0s)"
COLD=$(curl -sS -w '\n__HTTP_%{http_code}t=%{time_total}s' "$PROBE")
echo "$COLD"

# Warm probes — repeated identical calls test determinism
for i in 1 2 3; do
  sleep 2
  echo
  echo "── warm run $i (t+=2s)"
  curl -sS -w '\n__HTTP_%{http_code}t=%{time_total}s' "$PROBE"
done

echo
echo "== capture finished: $(date -u +%FT%TZ)"
