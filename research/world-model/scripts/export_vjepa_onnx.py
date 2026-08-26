"""
Stage 2 — Dual-output VJEPA ONNX export pipeline.

Inputs:
  - research/world-model/jepa-local/losses/vjepa_loss.py::VJEPAPredictorHead

Outputs:
  - public/wasm/predictor.onnx            (INT8 quantized, dual output)
  - public/wasm/predictor_vjepa_meta.json  (metadata for edge route)

Constraints:
  - predictor output dim MUST be 128 (WASM heap budget).
  - Output names fixed to ["mu", "log_var"] for the edge parser.
  - Model must be < 5 MB after INT8 quantization for Vercel deploy.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import torch

# Ensure jepa-local and world-model scripts are importable.
_SCRIPT_DIR = Path(__file__).resolve().parent
_JEPA_LOCAL = _SCRIPT_DIR.parent / "jepa-local"
sys.path.insert(0, str(_JEPA_LOCAL))
sys.path.insert(0, str(_SCRIPT_DIR))

from losses.vjepa_loss import VJEPAPredictorHead  # noqa: E402
from config import JEPAConfig  # noqa: E402


def export_vjepa_onnx(
    save_dir: Path,
    embedding_dim: int = 128,
    hidden_dim: int = 512,
    predictor_depth: int = 4,
    quantize: bool = True,
) -> dict:
    """
    Export VJEPAPredictorHead to ONNX with dual outputs.

    Returns metadata dict for the edge route.
    """
    save_dir.mkdir(parents=True, exist_ok=True)
    model = VJEPAPredictorHead(embedding_dim, hidden_dim, predictor_depth)
    model.eval()

    fp32_path = save_dir / "predictor_fp32.onnx"
    int8_path = save_dir / "predictor.onnx"
    meta_path = save_dir / "predictor_vjepa_meta.json"

    dummy = torch.randn(1, embedding_dim, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        str(fp32_path),
        input_names=["z"],
        output_names=["mu", "log_var"],
        dynamic_axes={"z": {0: "batch"}, "mu": {0: "batch"}, "log_var": {0: "batch"}},
        opset_version=18,
        do_constant_folding=True,
    )
    print(f"[OK] FP32 ONNX exported to {fp32_path}  ({fp32_path.stat().st_size / 1024:.1f} KB)")

    meta = {
        "model": "vjepa_predictor",
        "embedding_dim": embedding_dim,
        "hidden_dim": hidden_dim,
        "predictor_depth": predictor_depth,
        "inputs": [{"name": "z", "shape": ["batch", embedding_dim], "dtype": "float32"}],
        "outputs": [
            {"name": "mu", "shape": ["batch", embedding_dim], "dtype": "float32"},
            {"name": "log_var", "shape": ["batch", embedding_dim], "dtype": "float32"},
        ],
        "precision": "fp32",
        "size_bytes": fp32_path.stat().st_size,
    }

    if quantize:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType  # noqa: E402

            quantize_dynamic(
                model_input=str(fp32_path),
                model_output=str(int8_path),
                weight_type=QuantType.QUInt8,
                per_channel=False,
            )
            meta["precision"] = "int8"
            meta["size_bytes"] = int8_path.stat().st_size
            print(f"[OK] INT8 quantized to {int8_path}  ({int8_path.stat().st_size / 1024:.1f} KB)")
            fp32_path.unlink(missing_ok=True)
        except Exception as exc:
            print(f"[WARN] quantization skipped: {exc}")
            fp32_path.rename(int8_path)
            meta["precision"] = "fp32"
            meta["size_bytes"] = int8_path.stat().st_size

    meta["size_human"] = f"{meta['size_bytes'] / 1024:.1f} KB"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"[OK] metadata written to {meta_path}")
    return meta


def main():
    root = Path(__file__).resolve().parents[1]
    public_wasm = root / "public" / "wasm"

    dim = int(os.environ.get("JEPA_EMBEDDING_DIM", "128"))
    hidden = int(os.environ.get("JEPA_HIDDEN_DIM", "512"))
    depth = int(os.environ.get("JEPA_PREDICTOR_DEPTH", "4"))

    meta = export_vjepa_onnx(
        save_dir=public_wasm,
        embedding_dim=dim,
        hidden_dim=hidden,
        predictor_depth=depth,
        quantize=True,
    )
    print(f"[SUMMARY] model={meta['model']} precision={meta['precision']} size={meta['size_human']}")


if __name__ == "__main__":
    main()
