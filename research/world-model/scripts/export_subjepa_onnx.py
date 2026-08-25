"""
Stage 2 — INT8 ONNX cross-compilation pipeline.

Inputs:
  - models/subjepa_dummy.pt       (minimal torch model)
  - data/dummy_input.pt           (single example tensor)

Outputs:
  - public/wasm/subjepa_int8.onnx
  - public/wasm/subjepa_int8_meta.json

Tools required:
  - torch, onnx, onnxruntime (optional: onnxruntime-tools)
"""

import os
import sys
import json
import torch
import torch.nn as nn
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = PROJECT_ROOT / "models"
PUBLIC_WASM = PROJECT_ROOT / "public" / "wasm"


class TinySubJEPA(nn.Module):
    """Minimal single-linear-layer model matching intended latent dimension."""

    def __init__(self, latent_dim: int = 256):
        super().__init__()
        self.latent_dim = latent_dim
        self.encoder = nn.Linear(512, latent_dim)
        self.predictor = nn.Linear(latent_dim, latent_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        z = self.encoder(x)
        return self.predictor(z)


def export_onnx(model: nn.Module, save_path: Path, latent_dim: int = 256):
    model.eval()
    dummy = torch.randn(1, 512, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        str(save_path),
        input_names=["x"],
        output_names=["z_pred"],
        dynamic_axes={"x": {0: "batch"}, "z_pred": {0: "batch"}},
        opset_version=18,
        do_constant_folding=True,
    )
    print(f"[OK] exported ONNX to {save_path}")


def quantize_int8(
    fp32_path: Path,
    int8_path: Path,
    calibration_samples: int = 10,
):
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
    except Exception as e:
        print(f"[SKIP] onnxruntime.quantization unavailable: {e}")
        return False

    quantize_dynamic(
        model_input=str(fp32_path),
        model_output=str(int8_path),
        weight_type=QuantType.QUInt8,
        per_channel=False,
    )
    print(f"[OK] quantized INT8 model to {int8_path}")
    return True


def write_meta(int8_path: Path, meta_path: Path):
    size_bytes = int8_path.stat().st_size
    meta = {
        "model": "subjepa_int8",
        "latent_dim": 256,
        "input_shape": [1, 512],
        "output_shape": [1, 256],
        "precision": "int8",
        "size_bytes": size_bytes,
        "size_human": f"{size_bytes / 1024:.1f} KB",
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"[OK] wrote metadata to {meta_path}")


def main():
    latent_dim = int(os.environ.get("JEPA_LATENT_DIM", "256"))
    MODEL_MAP = {
        "subjepa_dummy": TinySubJEPA(latent_dim=latent_dim),
    }
    target = os.environ.get("JEPA_EXPORT_TARGET", "subjepa_dummy")

    if target not in MODEL_MAP:
        print(f"Unknown target: {target}. Available: {list(MODEL_MAP)}")
        sys.exit(2)

    model = MODEL_MAP[target]
    PUBLIC_WASM.mkdir(parents=True, exist_ok=True)

    fp32_path = PUBLIC_WASM / "subjepa_fp32.onnx"
    int8_path = PUBLIC_WASM / "subjepa_int8.onnx"
    meta_path = PUBLIC_WASM / "subjepa_int8_meta.json"

    export_onnx(model, fp32_path, latent_dim)
    quantize_int8(fp32_path, int8_path)
    write_meta(int8_path, meta_path)

    fp32_size = fp32_path.stat().st_size
    int8_size = int8_path.stat().st_size if int8_path.exists() else 0
    print(f"[SUMMARY] FP32={fp32_size/1024:.1f} KB INT8={int8_size/1024:.1f} KB")


if __name__ == "__main__":
    main()
