#!/usr/bin/env bash
# JEPA real-model shadow probe — bounded instrumentation run against a Vercel preview.
# Spec: research/world-model/jepa-real-model-shadow-probe-spec.md
#
# Usage: ./scripts/jepa-real-model-probe.sh <preview-url>
#
# Differences from scripts/jepa-probe.sh (capability probe, preserved):
#   - targets /api/jepa/shadow-probe (real predictor + reflection_expert)
#   - performs 1 cold + 5 warm invocations, 2s apart
#   - does NOT retry on circuit-open (fail-closed is part of the experiment)

set -euo pipefail

URL="${1:?usage: $0 <preview-url>}"
PROBE="$URL/api/jepa/shadow-probe"
OUT_DIR="research/world-model"
OUT="$OUT_DIR/jepa-real-model-probe-report.raw.jsonl"

mkdir -p "$OUT_DIR"

echo "== probe target: $PROBE"
echo "== raw output:   $OUT"
echo "== started:      $(date -u +%FT%TZ)"

: > "$OUT"

# Cold probe (first request)
echo
echo "── cold run (t=0s)"
COLD=$(curl -sS -w '\n__HTTP_%{http_code} t=%{time_total}s' "$PROBE")
echo "$COLD"
echo "$COLD" >> "$OUT"

# 5 warm probes — 2s apart
for i in 1 2 3 4 5; do
  sleep 2
  echo
  echo "── warm run $i (t+=2s)"
  WARM=$(curl -sS -w '\n__HTTP_%{http_code} t=%{time_total}s' "$PROBE")
  echo "$WARM"
  echo "$WARM" >> "$OUT"
done

echo
echo "== finished:     $(date -u +%FT%TZ)"
echo
echo "Optional seventh cold run (per spec): ONLY run if a cold invocation"
echo "exceeded 5s and you need to see how far past it goes. Default: skip."
