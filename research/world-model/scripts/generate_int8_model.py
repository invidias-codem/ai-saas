"""
Stage 2 — Generate minimal INT8 ONNX model using pure ONNX/ONNX Runtime tooling.
No PyTorch dependency.

Outputs:
  public/wasm/dummy_int8.onnx
"""

import sys
from pathlib import Path

try:
    import onnx
    from onnx import helper, TensorProto
    import numpy as np
    from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat
except Exception as e:
    print(f"[FATAL] missing dependency: {e}")
    raise SystemExit(2)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_WASM = PROJECT_ROOT / "public" / "wasm"
LATENT_DIM = 128


def build_fp32_model() -> Path:
    input_info = helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, LATENT_DIM])
    output_info = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, LATENT_DIM])

    W = np.random.randn(LATENT_DIM, LATENT_DIM).astype(np.float32)
    B = np.random.randn(LATENT_DIM).astype(np.float32)

    init_W = helper.make_tensor('W', TensorProto.FLOAT, W.shape, W.flatten().tolist())
    init_B = helper.make_tensor('B', TensorProto.FLOAT, B.shape, B.flatten().tolist())

    node_matmul = helper.make_node('MatMul', ['input', 'W'], ['matmul_out'])
    node_add = helper.make_node('Add', ['matmul_out', 'B'], ['output'])

    graph = helper.make_graph(
        [node_matmul, node_add],
        'jepa_dummy_graph',
        [input_info],
        [output_info],
        [init_W, init_B]
    )
    opset = helper.make_opsetid('', 13)
    model = helper.make_model(graph, producer_name='lattice-os-jepa', opset_imports=[opset])

    PUBLIC_WASM.mkdir(parents=True, exist_ok=True)
    fp32_path = PUBLIC_WASM / 'dummy_fp32.onnx'
    onnx.save(model, str(fp32_path))
    print(f"[OK] wrote {fp32_path}")
    return fp32_path


class DummyCalibrationReader(CalibrationDataReader):
    def __init__(self, num_samples: int = 10):
        self.data = [{'input': np.random.randn(1, LATENT_DIM).astype(np.float32)} for _ in range(num_samples)]
        self.enum_data = iter(self.data)

    def get_next(self):
        return next(self.enum_data, None)


def quantize(fp32_path: Path) -> Path:
    int8_path = PUBLIC_WASM / 'dummy_int8.onnx'
    quantize_static(
        model_input=str(fp32_path),
        model_output=str(int8_path),
        calibration_data_reader=DummyCalibrationReader(),
        quant_format=QuantFormat.QDQ,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        per_channel=False,
    )
    print(f"[OK] wrote {int8_path}")
    return int8_path


def main():
    fp32 = build_fp32_model()
    int8 = quantize(fp32)
    print(f"[SUMMARY] FP32={fp32.stat().st_size / 1024:.1f} KB INT8={int8.stat().st_size / 1024:.1f} KB")


if __name__ == '__main__':
    main()
