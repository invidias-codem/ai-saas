"""
Generate a minimal valid ONNX model using pure onnx.
Output: public/wasm/dummy_fp32.onnx
"""

import numpy as np
from pathlib import Path
from onnx import helper, TensorProto, save

PROJECT_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_WASM = PROJECT_ROOT / "public" / "wasm"
LATENT_DIM = 128

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
out_path = PUBLIC_WASM / 'dummy_fp32.onnx'
save(model, str(out_path))
print(f"[OK] wrote {out_path} ({out_path.stat().st_size} bytes)")
