/**
 * lib/jepa/compression/spectral-fft.ts
 *
 * Zero-dependency, Vercel Edge-compatible Spectral FFT Codec.
 * Executes O(N log N) Radix-2 Cooley-Tukey FFT for 128-dimensional vectors.
 *
 * Wire format matches Python bjepa/fft_io.py exactly:
 *   [num_coeffs: uint32]
 *   [real_1: f32][imag_1: f32] ... [real_k: f32][imag_k: f32]
 */

// In-place Cooley-Tukey Radix-2 FFT
function transform(
  real: Float32Array,
  imag: Float32Array,
  inverse: boolean = false,
): void {
  const n = real.length;

  // 1. Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempReal = real[i];
      const tempImag = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = tempReal;
      imag[j] = tempImag;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // 2. Cooley-Tukey decimation-in-time
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (inverse ? 2 * Math.PI : -2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < halfLen; j++) {
        const uReal = real[i + j];
        const uImag = imag[i + j];
        const vIdx = i + j + halfLen;

        const vReal = real[vIdx] * wReal - imag[vIdx] * wImag;
        const vImag = real[vIdx] * wImag + imag[vIdx] * wReal;

        real[i + j] = uReal + vReal;
        imag[i + j] = uImag + vImag;
        real[vIdx] = uReal - vReal;
        imag[vIdx] = uImag - vImag;

        const nextWReal = wReal * wLenReal - wImag * wLenImag;
        const nextWImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextWReal;
        wImag = nextWImag;
      }
    }
  }

  // 3. Scaling for Inverse FFT
  if (inverse) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

export function forwardFFT(
  mu: number[] | Float32Array,
): { real: Float32Array; imag: Float32Array } {
  const n = mu.length;
  const real = new Float32Array(mu);
  const imag = new Float32Array(n); // Initializes to zeros
  transform(real, imag, false);
  return { real, imag };
}

export function inverseFFT(real: Float32Array, imag: Float32Array): Float32Array {
  transform(real, imag, true);
  // Like np.fft.ifft(coeffs).real, we simply return the real component array
  return real;
}

export function packBelief(mu: number[] | Float32Array, keepRatio: number = 0.25): Uint8Array {
  const { real, imag } = forwardFFT(mu);
  const n = real.length;
  const k = Math.max(1, Math.floor(n * keepRatio));

  // 4 bytes for num_coeffs + (8 bytes per complex coeff)
  const buffer = new ArrayBuffer(4 + k * 8);
  const view = new DataView(buffer);

  // Little-endian matches Python's struct.pack('<I') and ('<ff')
  view.setUint32(0, k, true);

  let offset = 4;
  for (let i = 0; i < k; i++) {
    view.setFloat32(offset, real[i], true);
    view.setFloat32(offset + 4, imag[i], true);
    offset += 8;
  }

  return new Uint8Array(buffer);
}

export function unpackBeliefAndInvert(data: Uint8Array, originalDim: number = 128): Float32Array {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numCoeffs = view.getUint32(0, true);
  const real = new Float32Array(originalDim);
  const imag = new Float32Array(originalDim);

  let offset = 4;
  for (let i = 0; i < numCoeffs; i++) {
    real[i] = view.getFloat32(offset, true);
    imag[i] = view.getFloat32(offset + 4, true);
    offset += 8;
  }

  // Zeros are implicitly preserved for indices >= numCoeffs (high-frequency masking)
  return inverseFFT(real, imag);
}
