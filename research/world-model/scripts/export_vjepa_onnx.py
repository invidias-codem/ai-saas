"""
Stage 2 — Dual-output VJEMA ONNX export pipeline + optional reflection heads.

Inputs:
  - research/world-model/jepa-local/losses/vjepa_loss.py::VJEPAPredictorHead
  - research/world-model/jepa-local/losses/reflection_heads.py::ReflectionHeads

Outputs:
  - public/wasm/predictor.onnx            (INT8 quantized, dual output)
  - public/wasm/predictor_vjepa_meta.json  (metadata for edge route)
  - public/wasm/reflection_expert.onnx     (FP32 or INT8, optional)
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


def export_reflection_heads(
    save_dir: Path,
    embedding_dim: int = 128,
    hidden_dim: int = 256,
    predictor_depth: int = 3,
    quantize: bool = False,
    checkpoint_path: Path | None = None,
    untrained_probe_only: bool = False,
) -> dict:
    """
    Export ReflectionHeads to a standalone ONNX file.

    Guardrails:
      - Production artifact: refuses to export without `checkpoint_path` so an
        untrained ReflectionHeads never silently becomes the canonical
        `reflection_expert.onnx`.
      - Probe artifact: only via `untrained_probe_only=True`. Writes to a
        distinct filename (`reflection_expert_probe_untrained.onnx`) and is
        labeled `trainingState=untrained_probe_only` / `semanticValidity=false`
        in metadata. Treat this as architecture/runtime evidence only.
    """
    save_dir.mkdir(parents=True, exist_ok=True)

    if not untrained_probe_only and checkpoint_path is None:
        raise SystemExit(
            "Refusing to export reflection_expert without a trained checkpoint. "
            "Pass checkpoint_path=..., or set untrained_probe_only=True to emit "
            "the structural-probe artifact under a separate filename."
        )

    try:
        from losses.reflection_heads import ReflectionHeads  # noqa: E402
    except ImportError as exc:
        raise SystemExit(f"Failed to import reflection_heads: {exc}")

    model = ReflectionHeads(embedding_dim, hidden_dim, predictor_depth)
    if checkpoint_path is not None:
        state = torch.load(checkpoint_path, map_location="cpu")
        state_dict = state.get("state_dict", state)
        model.load_state_dict(state_dict)
    model.eval()

    if untrained_probe_only:
        final_name = "reflection_expert_probe_untrained.onnx"
        meta_name = "reflection_expert_probe_untrained_meta.json"
        model_label = "reflection_expert_probe_untrained"
        training_state = "untrained_probe_only"
        semantic_validity = False
    else:
        final_name = "reflection_expert.onnx"
        meta_name = "reflection_expert_meta.json"
        model_label = "reflection_expert"
        training_state = "trained"
        semantic_validity = True

    fp32_path = save_dir / f"{final_name.replace('.onnx', '')}_fp32.onnx"
    final_path = save_dir / final_name
    meta_path = save_dir / meta_name

    dummy_stuck = torch.randn(1, embedding_dim, dtype=torch.float32)
    dummy_context = torch.randn(1, embedding_dim, dtype=torch.float32)
    torch.onnx.export(
        model,
        (dummy_stuck, dummy_context),
        str(fp32_path),
        input_names=["z_stuck", "z_context"],
        output_names=["z_past", "z_hyper_future"],
        dynamic_axes={
            "z_stuck": {0: "batch"},
            "z_context": {0: "batch"},
            "z_past": {0: "batch"},
            "z_hyper_future": {0: "batch"},
        },
        opset_version=18,
        do_constant_folding=True,
    )
    print(f"[OK] Reflection FP32 ONNX exported to {fp32_path}  ({fp32_path.stat().st_size / 1024:.1f} KB)")

    meta = {
        "model": model_label,
        "trainingState": training_state,
        "semanticValidity": semantic_validity,
        "embedding_dim": embedding_dim,
        "hidden_dim": hidden_dim,
        "predictor_depth": predictor_depth,
        "inputs": [
            {"name": "z_stuck", "shape": ["batch", embedding_dim], "dtype": "float32"},
            {"name": "z_context", "shape": ["batch", embedding_dim], "dtype": "float32"},
        ],
        "outputs": [
            {"name": "z_past", "shape": ["batch", embedding_dim], "dtype": "float32"},
            {"name": "z_hyper_future", "shape": ["batch", embedding_dim], "dtype": "float32"},
        ],
        "precision": "fp32",
        "size_bytes": fp32_path.stat().st_size,
    }

    if quantize:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType  # noqa: E402

            quantize_dynamic(
                model_input=str(fp32_path),
                model_output=str(final_path),
                weight_type=QuantType.QUInt8,
                per_channel=False,
            )
            meta["precision"] = "int8"
            meta["size_bytes"] = final_path.stat().st_size
            print(f"[OK] Reflection INT8 quantized to {final_path}  ({final_path.stat().st_size / 1024:.1f} KB)")
            fp32_path.unlink(missing_ok=True)
        except Exception as exc:
            print(f"[WARN] reflection quantization skipped: {exc}")
            fp32_path.rename(final_path)
            meta["precision"] = "fp32"
            meta["size_bytes"] = final_path.stat().st_size
    else:
        fp32_path.rename(final_path)
        meta["precision"] = "fp32"
        meta["size_bytes"] = final_path.stat().st_size

    meta["size_human"] = f"{meta['size_bytes'] / 1024:.1f} KB"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"[OK] reflection metadata written to {meta_path}")
    return meta


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    public_wasm = root / "public" / "wasm"
    print(f"[INFO] output dir (resolved): {public_wasm}")
    print("[INFO] note: default root is research/world-model/. Use JEPA_ONNX_PATH"
          " or another absolute override if you need repo-root public/wasm.")

    dim = int(os.environ.get("JEPA_EMBEDDING_DIM", "128"))
    hidden = int(os.environ.get("JEPA_HIDDEN_DIM", "512"))
    depth = int(os.environ.get("JEPA_PREDICTOR_DEPTH", "4"))
    export_reflection = os.environ.get("JEPA_EXPORT_REFLECTION", "0") == "1"
    untrained_probe = os.environ.get("JEPA_EXPORT_UNTRAINED", "0") == "1"
    quantize_reflection = os.environ.get("JEPA_QUANTIZE_REFLECTION", "0") == "1"
    reflection_ckpt = os.environ.get("JEPA_REFLECTION_CHECKPOINT") or None

    meta = export_vjepa_onnx(
        save_dir=public_wasm,
        embedding_dim=dim,
        hidden_dim=hidden,
        predictor_depth=depth,
        quantize=True,
    )
    print(f"[SUMMARY] model={meta['model']} precision={meta['precision']} size={meta['size_human']}")

    if export_reflection:
        try:
            reflection_meta = export_reflection_heads(
                save_dir=public_wasm,
                embedding_dim=dim,
                hidden_dim=int(os.environ.get("JEPA_REFLECTION_HIDDEN_DIM", "256")),
                predictor_depth=int(os.environ.get("JEPA_REFLECTION_DEPTH", "3")),
                quantize=quantize_reflection,
                checkpoint_path=Path(reflection_ckpt) if reflection_ckpt else None,
                untrained_probe_only=untrained_probe,
            )
            print(
                f"[SUMMARY] reflection model={reflection_meta['model']} "
                f"trainingState={reflection_meta['trainingState']} "
                f"precision={reflection_meta['precision']} size={reflection_meta['size_human']}"
            )
        except Exception as exc:
            print(f"[WARN] reflection export skipped: {exc}")
    else:
        print("[INFO] Skipping reflection expert export. Set JEPA_EXPORT_REFLECTION=1 to enable.")


if __name__ == "__main__":
    main()
