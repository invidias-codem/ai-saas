#!/usr/bin/env bash
# JEPA real-model shadow probe — bounded instrumentation run against a Vercel preview.
# Spec: research/world-model/jepa-real-model-shadow-probe-spec.md
#
# Usage: ./scripts/jepa-real-model-probe.sh <preview-url>
#
# Differences from scripts/jepa-probe.sh (capability probe, preserved):
#   - targets /api/jepa/shadow-probe (real predictor + reflection_expert)
#   - performs 1 cold + 5 warm invocations, 2s apart
#   - emits STRICT JSONL: one JSON object per invocation per line,
#     with transport metadata merged into the body as `_http_status` and
#     `_wall_ms` so the raw artifact parses line-by-line.
#   - does NOT auto-retry on circuit-open (fail-closed is part of the experiment)

set -euo pipefail

URL="${1:?usage: $0 <preview-url>}"
PROBE="$URL/api/jepa/shadow-probe"
OUT_DIR="research/world-model"
OUT="$OUT_DIR/jepa-real-model-probe-report.raw.jsonl"

mkdir -p "$OUT_DIR"
: > "$OUT"

echo "== probe target: $PROBE"
echo "== raw output:   $OUT"
echo "== started:      $(date -u +%FT%TZ)"

probe_once() {
  local label="$1"
  # Single curl: write body to stdout-readable file while capturing code+time.
  # `-w` writes to stdout, body to a temp file; then merge into one JSON line.
  local tmp_body
  tmp_body=$(mktemp)
  trap 'rm -f "$tmp_body"' RETURN

  local meta
  meta=$(curl -sS -o "$tmp_body" -w '%{http_code} %{time_total}' "$PROBE")
  local http_code="${meta%% *}"
  local time_total="${meta##* }"

  python3 - "$tmp_body" "$http_code" "$time_total" "$label" <<'PY'
import json, sys
body_path, code, time_total, label = sys.argv[1:5]
try:
    data = json.load(open(body_path))
except Exception:
    data = {'_unparseable_body': open(body_path).read()[:400]}
data['_http_status'] = int(code)
data['_wall_ms'] = int(float(time_total) * 1000)
data['_label'] = label
print(json.dumps(data))
PY
}

# Cold
LINE=$(probe_once "cold")
echo "$LINE"
echo "$LINE" >> "$OUT"

# 5 warm
for i in 1 2 3 4 5; do
  sleep 2
  LINE=$(probe_once "warm-$i")
  echo "$LINE"
  echo "$LINE" >> "$OUT"
done

echo
echo "== finished:     $(date -u +%FT%TZ)"
echo
echo "Optional seventh cold run (per spec): ONLY run if a cold invocation"
echo "exceeded 5s and you need to see how far past it goes. Default: skip."
