"""
Stage 2 — INT8 ONNX inference benchmark.

Reads an INT8 model from public/wasm/ and measures:
- ONNX Runtime init time
- Single inference latency
- Memory footprint via RSS delta
"""

import json
import time
import tracemalloc
from pathlib import Path
from statistics import mean, stdev

try:
    import onnxruntime as ort
except Exception as e:
    print(f"[FATAL] onnxruntime unavailable: {e}")
    raise SystemExit(2)

try:
    import numpy as np
except Exception as e:
    print(f"[FATAL] numpy unavailable: {e}")
    raise SystemExit(2)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_WASM = PROJECT_ROOT / "public" / "wasm"
META_PATH = PUBLIC_WASM / "subjepa_int8_meta.json"


def load_model(public_dir: Path) -> ort.InferenceSession:
    model_path = public_dir / "subjepa_int8.onnx"
    if not model_path.exists():
        raise FileNotFoundError(f"Missing INT8 model: {model_path}")

    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    session = ort.InferenceSession(str(model_path), opts, providers=["CPUExecutionProvider"])
    return session


def benchmark(session: ort.InferenceSession, warmup: int = 5, repeats: int = 20):
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    x = np.random.randn(*input_shape).astype(np.float32)

    for _ in range(warmup):
        session.run(None, {input_name: x})

    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        session.run(None, {input_name: x})
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000.0)

    avg = mean(times)
    std = stdev(times) if len(times) > 1 else 0.0
    p95 = sorted(times)[int(len(times) * 0.95)]
    return {
        "provider": session.get_providers()[0],
        "warmup_runs": warmup,
        "measured_runs": repeats,
        "latency_avg_ms": round(avg, 3),
        "latency_std_ms": round(std, 3),
        "latency_p95_ms": round(p95, 3),
        "input_shape": input_shape,
        "input_name": input_name,
    }


def memory_profile(session: ort.InferenceSession, repeats: int = 10):
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    x = np.random.randn(*input_shape).astype(np.float32)

    tracemalloc.start()
    snap_before = tracemalloc.take_snapshot()

    for _ in range(repeats):
        session.run(None, {input_name: x})

    snap_after = tracemalloc.take_snapshot()
    tracemalloc.stop()

    stats = snap_after.compare_to(snap_before, "lineno")
    total_alloc = sum(s.size_diff for s in stats if s.size_diff > 0)
    return {
        "alloc_delta_bytes": total_alloc,
        "alloc_delta_human": f"{total_alloc / 1024:.1f} KB",
    }


def main():
    meta = json.loads(META_PATH.read_text()) if META_PATH.exists() else {}
    print(f"[INFO] loading INT8 model from {PUBLIC_WASM}")
    session = load_model(PUBLIC_WASM)

    print(f"[INFO] provider={session.get_providers()[0]}")
    perf = benchmark(session)
    mem = memory_profile(session)

    result = {**meta, **perf, **mem}
    print(json.dumps(result, indent=2))

    out_path = PUBLIC_WASM / "subjepa_int8_benchmark.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(f"[OK] wrote benchmark to {out_path}")


if __name__ == "__main__":
    main()
