import onnx
from onnx import helper, TensorProto
import numpy as np
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat

LATENT_DIM = 128

# 1. Generate minimal dummy ONNX model directly (Bypassing PyTorch)
input_info = helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, LATENT_DIM])
output_info = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, LATENT_DIM])

W = np.random.randn(LATENT_DIM, LATENT_DIM).astype(np.float32)
B = np.random.randn(LATENT_DIM).astype(np.float32)

init_W = helper.make_tensor('W', TensorProto.FLOAT, W.shape, W.flatten().tolist())
init_B = helper.make_tensor('B', TensorProto.FLOAT, B.shape, B.flatten().tolist())

node_matmul = helper.make_node('MatMul', ['input', 'W'], ['matmul_out'])
node_add = helper.make_node('Add', ['matmul_out', 'B'], ['output'])

# Opset 10+ is strictly required for ONNX quantization
graph = helper.make_graph(
    [node_matmul, node_add], 
    'jepa_dummy_graph', 
    [input_info], 
    [output_info], 
    [init_W, init_B]
)
opset = helper.make_opsetid('', 13) 
model = helper.make_model(graph, producer_name='lattice-os-jepa', opset_imports=[opset])

onnx.save(model, 'dummy_fp32.onnx')
print("Generated dummy_fp32.onnx")

# 2. Implement the Calibration Data Reader for Static Quantization
class DummyCalibrationReader(CalibrationDataReader):
    def __init__(self, num_samples=10):
        self.data = [{'input': np.random.randn(1, LATENT_DIM).astype(np.float32)} for _ in range(num_samples)]
        self.enum_data = iter(self.data)
        
    def get_next(self):
        return next(self.enum_data, None)

# 3. Execute Static Quantization
quantize_static(
    model_input='dummy_fp32.onnx',
    model_output='dummy_int8.onnx',
    calibration_data_reader=DummyCalibrationReader(),
    quant_format=QuantFormat.QDQ,
    activation_type=QuantType.QUInt8,
    weight_type=QuantType.QInt8,
    per_channel=False
)
print("Quantization complete. Artifact saved as dummy_int8.onnx")
