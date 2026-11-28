# Spectral Neural Network Compression via FFT

Research excerpt on Fourier-based neural network compression, spectral training,
and continuous signal decoding as an alternative to discrete LZ compression.

---

## Key Concepts

- Neural networks are mathematically isomorphic to DFT/FFT under linear activation.
- Spectral compression achieves 10x–15x compression with negligible accuracy loss.
- Reverse FFT decodes continuous signals with mathematical optimality (orthogonal projection).
- FNet replaces self-attention with parameter-free Fourier sublayers.
- Sparse Spectral Training (SST) reduces memory by optimizing singular values, not full matrices.
- Oscillatory Fourier Neural Networks eliminate BPTT for sequential tasks.

---

## Source Material

Extracted from research report on spectral neural network compression and continuous signal decoding.
