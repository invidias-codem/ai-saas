import json
import base64
import numpy as np
import os
from pathlib import Path

sys_path_inserted = False
try:
    sys_path = Path(__file__).resolve().parents[1]
    if str(sys_path) not in os.sys.path:
        os.sys.path.insert(0, str(sys_path))
        sys_path_inserted = True
    from bjepa.fft_io import pack_belief
except ImportError as exc:
    raise SystemExit(f"Failed to import fft_io: {exc}")

try:
    x = np.linspace(0, 4 * np.pi, 128, dtype=np.float32)
    prior_mu = (np.sin(x) + 0.5 * np.cos(2 * x)).astype(np.float32)
    prior_sigma = np.full(128, 0.001, dtype=np.float32)

    packed_mu = pack_belief(prior_mu, keep_ratio=0.25)
    packed_sigma = pack_belief(prior_sigma, keep_ratio=0.25)

    payload = {
        "id": "memory_safety",
        "description": "Forces structural memory safety constraints during latent rollout",
        "spectralMu": base64.b64encode(packed_mu).decode("utf-8"),
        "spectralVar": base64.b64encode(packed_sigma).decode("utf-8"),
    }

    out_dir = Path(__file__).resolve().parents[4] / "public" / "priors"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "memory_safety.json"
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Generated BJEPA Prior: {out_path}")
finally:
    if sys_path_inserted:
        os.sys.path.remove(str(sys_path))
