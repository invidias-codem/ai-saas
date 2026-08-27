import { forwardFFT, inverseFFT, packBelief, unpackBeliefAndInvert } from './spectral-fft';

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function arrayClose(a: Float32Array, b: Float32Array, atol = 1e-5): boolean {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > atol) return false;
  }
  return true;
}

// Test 1: full roundtrip
const x = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
const { real, imag } = forwardFFT(x);
const rec = inverseFFT(real, imag);
console.log('Test 1 full roundtrip:', arrayClose(x, rec) ? 'PASS' : 'FAIL');

// Test 2: spectral packing at 25%
const mu128 = new Float32Array(128);
for (let i = 0; i < 128; i++) {
  mu128[i] = Math.sin((i / 128) * Math.PI * 4) + 0.5 * Math.sin((i / 128) * Math.PI * 12);
}

const packed = packBelief(mu128, 0.25);
console.log('Test 2 packed bytes:', packed.length);

const reconstructed = unpackBeliefAndInvert(packed, 128);
const cos = cosineSimilarity(mu128, reconstructed);
console.log('Test 2 cosine similarity:', cos.toFixed(4), cos > 0.99 ? 'PASS' : 'FAIL');

// Test 3: deterministic packing
const p1 = packBelief(mu128, 0.25);
const p2 = packBelief(mu128, 0.25);
console.log('Test 3 deterministic:', p1.length === p2.length && p1.every((v, i) => v === p2[i]) ? 'PASS' : 'FAIL');

// Test 4: roundtrip at different keep ratios
for (const keep of [0.5, 0.25, 0.125]) {
  const packed = packBelief(mu128, keep);
  const rec = unpackBeliefAndInvert(packed, 128);
  const cos = cosineSimilarity(mu128, rec);
  console.log(`Test 4 keep=${keep}: bytes=${packed.length} cos=${cos.toFixed(4)}`);
}
