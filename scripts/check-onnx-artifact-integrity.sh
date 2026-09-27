#!/usr/bin/env bash
# ONNX artifact ↔ metadata integrity gate.
# Fails if any *_meta.json's size_bytes disagrees with the actual .onnx bytes.
# Introduced after the b67ada56 incident: a 737 KB canonical predictor was
# silently swapped for a 2.63 MB blob in public/wasm/ while metadata stayed
# unchanged, causing predictor postprocessing to fail in production.
#
# File naming convention in this repo:
#   <model>.onnx
#   <model>_vjepa_meta.json | <model>_meta.json
# Handle both forms explicitly; never silently skip a present meta.
# ponytail: explicit file list, no glob magic — add a row when a new artifact ships.
set -euo pipefail

check() {
  local onnx="$1" meta="$2"
  if [ ! -f "$onnx" ]; then
    echo "FAIL: meta present but artifact missing: $meta -> $onnx" >&2
    return 1
  fi
  if [ ! -f "$meta" ]; then
    return 0 # artifact without meta is out of scope for this gate
  fi
  local declared actual
  declared=$(node -pe "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).size_bytes" "$meta")
  actual=$(stat -f%z "$onnx" 2>/dev/null || stat -c%s "$onnx") # macOS vs GNU
  if [ "$declared" != "$actual" ]; then
    echo "FAIL: $onnx meta.size_bytes=$declared actual=$actual ($meta)" >&2
    return 1
  fi
  echo "OK: $onnx ($actual bytes)"
  return 0
}

exit_code=0

# Predictor (canonical + deployed copy) — meta is named _vjepa_ though artifact isn't.
check public/wasm/predictor.onnx                       public/wasm/predictor_vjepa_meta.json                       || exit_code=1
check research/world-model/public/wasm/predictor.onnx  research/world-model/public/wasm/predictor_vjepa_meta.json  || exit_code=1
# Reflection probe
check public/wasm/reflection_expert_probe_untrained.onnx public/wasm/reflection_expert_probe_untrained_meta.json   || exit_code=1

exit "$exit_code"
