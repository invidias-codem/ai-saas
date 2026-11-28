"""
End-to-end integration test for spectral BJEPA belief propagation.

Simulates:
1. TypeScript packBelief -> base64
2. JSONL queue write with spectralMu + spectralVar
3. Python base64 decode + unpack_belief_and_invert
4. Verify reconstruction fidelity
"""

import base64
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(ROOT / "research" / "world-model" / "jepa-local"))

from bjepa.fft_io import pack_belief, unpack_belief_and_invert


def ts_pack_belief_mu(mu, keep_ratio=0.25):
    packed = pack_belief(mu, None, keep_ratio=keep_ratio)
    return base64.b64encode(packed).decode("ascii")


def ts_pack_belief_var(sigma, keep_ratio=0.25):
    packed = pack_belief(np.zeros_like(sigma), sigma, keep_ratio=keep_ratio)
    return base64.b64encode(packed).decode("ascii")


def main():
    # Use a structured low-frequency signal to match real BJEMA latent dynamics.
    # Raw random noise at 25% lowpass will not reconstruct faithfully; this
    # validates the actual expected mesh payload behavior.
    t = np.linspace(0, 4 * np.pi, 128, dtype=np.float32)
    mu = (np.sin(t) + 0.5 * np.sin(3 * t)).astype(np.float32)
    sigma = np.abs(np.random.randn(128)).astype(np.float32) * 0.1

    metadata = {
        "accuracy": 0.92,
        "dataset_size": 10,
        "timestamp": 1715000000,
        "peerId": "peer-e2e-test",
        "modelGeneration": 1,
    }

    print("[TS] packBelief mu/sigma -> base64...")
    spectral_mu_b64 = ts_pack_belief_mu(mu, keep_ratio=0.25)
    spectral_sigma_b64 = ts_pack_belief_var(sigma, keep_ratio=0.25)

    print(f"[TS] spectralMu length={len(spectral_mu_b64)} sigma length={len(spectral_sigma_b64)}")

    payload = {
        "weights": {},
        "metadata": metadata,
        "spectralMu": spectral_mu_b64,
        "spectralVar": spectral_sigma_b64,
    }
    line = json.dumps(payload, separators=(",", ":"))
    print(f"[JSONL] payload bytes={len(line.encode('utf-8'))}")

    print("[Python] base64 decode + unpack_belief_and_invert...")
    mu_bytes = base64.b64decode(payload["spectralMu"])
    sigma_bytes = base64.b64decode(payload["spectralVar"])
    decoded_mu = unpack_belief_and_invert(mu_bytes, original_dim=128)
    decoded_sigma = unpack_belief_and_invert(sigma_bytes, original_dim=128)
    rec_mu = decoded_mu["mu"]
    rec_sigma = decoded_sigma["sigma"]

    mu_cos = float(np.dot(mu, rec_mu) / (np.linalg.norm(mu) * np.linalg.norm(rec_mu)))
    sigma_cos = float(np.dot(sigma, rec_sigma) / (np.linalg.norm(sigma) * np.linalg.norm(rec_sigma)))
    mu_mae = float(np.mean(np.abs(mu - rec_mu)))
    sigma_mae = float(np.mean(np.abs(sigma - rec_sigma)))

    print(f"[Python] mu cosine={mu_cos:.6f} mae={mu_mae:.6f}")
    print(f"[Python] sigma cosine={sigma_cos:.6f} mae={sigma_mae:.6f}")

    passed = bool(mu_cos > 0.99 and sigma_cos > 0.99 and mu_mae < 0.5 and sigma_mae < 0.5)
    print(f"[Python] end-to-end test passed={passed}")
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
