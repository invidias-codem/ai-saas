"""
research/world-model/jepa-local/bjepa/fft_io.py

Spectral compression utilities for BJEPA belief-state propagation.

- forward_fft / inverse_fft: O(N log N) complex DFT/IDFT via numpy.
- spectral_mask: hard low-pass retain of first k coefficients, or magnitude-based top-k.
- pack_belief / unpack_belief_and_invert: dense binary serialization using struct.
  Schema: [num_coeffs: uint32][real_1: f32][imag_1: f32]...[real_k: f32][imag_k: f32]

Design constraints
------------------
* Input mu is real-valued; numpy.fft.fft yields complex coefficients.
* For real inputs, FFT symmetry means only the first half carries independent info,
  but we keep the full complex array semantics here for generality and mask flexibility.
* Masking is applied BEFORE packing; only retained coefficients are serialized.
* Reconstruction zero-fills discarded high-frequency coefficients before IFFT.
* Cosine-similarity validation target: >0.99 between original and reconstructed mu.
"""

from __future__ import annotations

import struct
from typing import Tuple

import numpy as np


class BeliefDict(dict):
    mu: np.ndarray
    sigma: np.ndarray
    prior_mu: np.ndarray
    prior_sigma: np.ndarray


# ---------------------------------------------------------------------------
# Core spectral transforms
# ---------------------------------------------------------------------------

def forward_fft(mu: np.ndarray) -> np.ndarray:
    """Computes the 1D Discrete Fourier Transform of the continuous state vector.

    Uses ``np.fft.fft`` for real-valued input, returning the full complex spectrum
    of length ``N``. This matches the Radix-2 Cooley-Tukey implementation used on
    the TypeScript edge and preserves the exact byte layout for cross-language
    serialization.

    Args:
        mu: Real-valued spatial vector of shape (N,).

    Returns:
        Complex frequency coefficients of shape (N,).
    """
    if not isinstance(mu, np.ndarray):
        mu = np.asarray(mu, dtype=np.float32)
    return np.fft.fft(mu)


def inverse_fft(coeffs: np.ndarray) -> np.ndarray:
    """Computes the Inverse DFT to reconstruct the spatial vector.

    Uses ``np.fft.ifft`` and returns the real component, matching the TypeScript
    edge decoder exactly.

    Args:
        coeffs: Complex frequency coefficients from forward_fft, shape (N,).

    Returns:
        Real-valued spatial vector of shape (N,).
    """
    if not isinstance(coeffs, np.ndarray):
        coeffs = np.asarray(coeffs, dtype=np.complex64)
    return np.fft.ifft(coeffs).real


# ---------------------------------------------------------------------------
# Spectral masking
# ---------------------------------------------------------------------------

def spectral_mask(
    coeffs: np.ndarray,
    keep_ratio: float = 0.25,
    mode: str = "lowpass",
) -> Tuple[np.ndarray, np.ndarray]:
    """Retain a subset of Fourier coefficients for compression.

    Operates on full-complex coefficients from ``np.fft.fft``.

    Two selection modes:
      * "lowpass": retain the first k coefficients (DC + low-frequency harmonics).
        This is an exact orthogonal projection onto the low-frequency subspace.
      * "magnitude": retain the top-k coefficients by magnitude |c|, regardless of
        frequency index. This preserves the highest-energy components.

    Note: The binary wire format with TypeScript only supports lowpass mode,
    because indices are not transmitted.

    Args:
        coeffs: Complex frequency coefficients from forward_fft, shape (N,).
        keep_ratio: Fraction of total coefficients to retain (0 < keep_ratio <= 1).
        mode: "lowpass" or "magnitude".

    Returns:
        indices: Integer indices of retained coefficients, shape (k,).
        masked_coeffs: The retained complex coefficients, shape (k,).
    """
    n = len(coeffs)
    if keep_ratio <= 0 or keep_ratio > 1:
        raise ValueError(f"keep_ratio must be in (0, 1], got {keep_ratio}")

    k = min(n, max(1, int(n * keep_ratio)))

    if mode == "lowpass":
        indices = np.arange(k, dtype=np.int32)
        masked_coeffs = coeffs[:k].copy()
    elif mode == "magnitude":
        mags = np.abs(coeffs)
        top_k = np.argpartition(mags, -k)[-k:]
        indices = np.sort(top_k).astype(np.int32)
        masked_coeffs = coeffs[indices]
    else:
        raise ValueError(f"Unknown mode: {mode!r}. Use 'lowpass' or 'magnitude'.")

    return indices, masked_coeffs


# ---------------------------------------------------------------------------
# Binary packing / unpacking
# ---------------------------------------------------------------------------

def pack_belief(
    mu: np.ndarray,
    sigma: np.ndarray | None = None,
    prior_mu: np.ndarray | None = None,
    prior_sigma: np.ndarray | None = None,
    keep_ratio: float = 0.25,
    mask_mode: str = "lowpass",
) -> bytes:
    """Transform and pack a BJEPA belief state into a dense binary payload.

    Payload schema:
      [num_mu_coeffs: uint32]
      [mu_real_1: f32][mu_imag_1: f32] ... [mu_real_k: f32][mu_imag_k: f32]
      [num_sigma_nonzero: uint16]
      [sigma_index_1: uint8][sigma_value_1: f32] ...  (sparse diagonal)
      [num_prior_mu_coeffs: uint32]
      [pm_real_1: f32][pm_imag_1: f32] ...
      [num_prior_sigma_nonzero: uint16]
      [ps_index_1: uint8][ps_value_1: f32] ...

    Note: Cross-language serialization with the TypeScript edge codec assumes
    lowpass masking, so coefficients are packed in sequential index order.

    Args:
        mu: Dense mean vector, shape (N,), float32.
        sigma: Diagonal variance vector, shape (N,), float32. None = zeros.
        prior_mu: Structural prior mean, shape (N,), float32. None = zeros.
        prior_sigma: Structural prior diagonal variance, shape (N,), float32. None = zeros.
        keep_ratio: Fraction of FFT coefficients to retain.
        mask_mode: "lowpass" or "magnitude".

    Returns:
        Compact binary payload as bytes.
    """
    mu = np.asarray(mu, dtype=np.float32)
    n = mu.shape[0]

    # ---- mu spectral ----
    mu_coeffs = forward_fft(mu)
    mu_indices, mu_masked = spectral_mask(mu_coeffs, keep_ratio, mask_mode)
    mu_k = len(mu_indices)

    payload = bytearray()
    payload.extend(struct.pack("<I", mu_k))
    for c in mu_masked:
        payload.extend(struct.pack("<ff", float(c.real), float(c.imag)))

    # ---- sigma sparse diagonal ----
    sigma = np.asarray(sigma, dtype=np.float32) if sigma is not None else np.zeros(n, dtype=np.float32)
    sigma_mask = sigma > 1e-12
    sigma_indices = np.nonzero(sigma_mask)[0].astype(np.uint8)
    sigma_values = sigma[sigma_mask]
    payload.extend(struct.pack("<H", len(sigma_indices)))
    for idx, val in zip(sigma_indices, sigma_values):
        payload.extend(struct.pack("<Bf", int(idx), float(val)))

    # ---- prior_mu spectral ----
    if prior_mu is not None:
        prior_mu = np.asarray(prior_mu, dtype=np.float32)
        pm_coeffs = forward_fft(prior_mu)
        pm_indices, pm_masked = spectral_mask(pm_coeffs, keep_ratio, mask_mode)
        pm_k = len(pm_indices)
        payload.extend(struct.pack("<I", pm_k))
        for c in pm_masked:
            payload.extend(struct.pack("<ff", float(c.real), float(c.imag)))
    else:
        payload.extend(struct.pack("<I", 0))

    # ---- prior_sigma sparse diagonal ----
    if prior_sigma is not None:
        prior_sigma = np.asarray(prior_sigma, dtype=np.float32)
        ps_mask = prior_sigma > 1e-12
        ps_indices = np.nonzero(ps_mask)[0].astype(np.uint8)
        ps_values = prior_sigma[ps_mask]
        payload.extend(struct.pack("<H", len(ps_indices)))
        for idx, val in zip(ps_indices, ps_values):
            payload.extend(struct.pack("<Bf", int(idx), float(val)))
    else:
        payload.extend(struct.pack("<H", 0))

    return bytes(payload)


def unpack_belief_and_invert(
    data: bytes,
    original_dim: int = 128,
) -> dict:
    """Unpack a binary belief payload and reconstruct spatial belief vectors.

    Args:
        data: Binary payload from pack_belief.
        original_dim: Expected dimensionality of the spatial vectors.

    Returns:
        Dict with keys:
          - mu: np.ndarray float32, reconstructed mean
          - sigma: np.ndarray float32, reconstructed diagonal variance
          - prior_mu: np.ndarray float32, reconstructed prior mean (or zeros)
          - prior_sigma: np.ndarray float32, reconstructed prior variance (or zeros)
    """
    offset = 0
    n = original_dim

    # ---- mu ----
    mu_k = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    mu_coeffs = np.zeros(n, dtype=np.complex64)
    for i in range(mu_k):
        real, imag = struct.unpack_from("<ff", data, offset)
        mu_coeffs[i] = complex(real, imag)
        offset += 8
    mu = inverse_fft(mu_coeffs).astype(np.float32)

    # ---- sigma ----
    sigma_nonzero = struct.unpack_from("<H", data, offset)[0]
    offset += 2
    sigma = np.zeros(n, dtype=np.float32)
    for _ in range(sigma_nonzero):
        idx, val = struct.unpack_from("<Bf", data, offset)
        sigma[int(idx)] = val
        offset += 5

    # ---- prior_mu ----
    pm_k = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    prior_mu = np.zeros(n, dtype=np.float32)
    if pm_k > 0:
        pm_coeffs = np.zeros(n, dtype=np.complex64)
        for i in range(pm_k):
            real, imag = struct.unpack_from("<ff", data, offset)
            pm_coeffs[i] = complex(real, imag)
            offset += 8
        prior_mu = inverse_fft(pm_coeffs).astype(np.float32)

    # ---- prior_sigma ----
    ps_nonzero = struct.unpack_from("<H", data, offset)[0]
    offset += 2
    prior_sigma = np.zeros(n, dtype=np.float32)
    for _ in range(ps_nonzero):
        idx, val = struct.unpack_from("<Bf", data, offset)
        prior_sigma[int(idx)] = val
        offset += 5

    return {
        "mu": mu,
        "sigma": sigma,
        "prior_mu": prior_mu,
        "prior_sigma": prior_sigma,
    }


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two real vectors."""
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    dot = float(np.dot(a, b))
    norm_a = float(np.linalg.norm(a))
    norm_b = float(np.linalg.norm(b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def validate_roundtrip(
    dim: int = 128,
    keep_ratio: float = 0.25,
    mask_mode: str = "lowpass",
    seed: int = 42,
) -> dict:
    """Validate pack/unpack roundtrip fidelity.

    Returns a dict with reconstruction metrics.
    """
    rng = np.random.default_rng(seed)
    mu = rng.standard_normal(dim).astype(np.float32)
    sigma = np.abs(rng.standard_normal(dim)).astype(np.float32) * 0.1
    prior_mu = rng.standard_normal(dim).astype(np.float32)
    prior_sigma = np.abs(rng.standard_normal(dim)).astype(np.float32) * 0.05

    packed = pack_belief(mu, sigma, prior_mu, prior_sigma, keep_ratio, mask_mode)
    rec = unpack_belief_and_invert(packed, original_dim=dim)

    mu_sim = cosine_similarity(mu, rec["mu"])
    pm_sim = cosine_similarity(prior_mu, rec["prior_mu"])

    mu_mae = float(np.mean(np.abs(mu - rec["mu"])))
    pm_mae = float(np.mean(np.abs(prior_mu - rec["prior_mu"])))

    return {
        "packed_bytes": len(packed),
        "mu_cosine_similarity": mu_sim,
        "prior_mu_cosine_similarity": pm_sim,
        "mu_mae": mu_mae,
        "prior_mu_mae": pm_mae,
        "pass": mu_sim > 0.99 and pm_sim > 0.99,
    }
