"""
research/world-model/jepa-local/tests/test_fft_io.py

Unit tests for bjepa/fft_io.py roundtrip fidelity and edge cases.
"""

from __future__ import annotations

import struct
import math

import numpy as np

from bjepa.fft_io import (
    forward_fft,
    inverse_fft,
    spectral_mask,
    pack_belief,
    unpack_belief_and_invert,
    cosine_similarity,
)


def assert_allclose(a: np.ndarray, b: np.ndarray, atol: float = 1e-5):
    if not np.allclose(a, b, atol=atol):
        raise AssertionError(f"Arrays differ: max diff = {np.max(np.abs(a - b))}")


def test_full_fft_roundtrip():
    np.random.seed(0)
    x = np.random.randn(128).astype(np.float32)
    coeffs = forward_fft(x)
    rec = inverse_fft(coeffs)
    assert_allclose(x, rec, atol=1e-5)
    assert cosine_similarity(x, rec) > 0.999999


def test_spectral_mask_lowpass():
    coeffs = np.ones(65, dtype=np.complex64)
    indices, masked = spectral_mask(coeffs, keep_ratio=0.25, mode="lowpass")
    assert len(indices) == 16
    assert list(indices) == list(range(16))
    assert np.allclose(masked, coeffs[:16])


def test_spectral_mask_magnitude():
    coeffs = np.zeros(65, dtype=np.complex64)
    coeffs[10] = 10.0 + 0j
    coeffs[50] = 5.0 + 0j
    coeffs[30] = 1.0 + 0j
    indices, masked = spectral_mask(coeffs, keep_ratio=0.05, mode="magnitude")
    # Top-2 by magnitude: indices 10 and 50 should be retained.
    assert 10 in indices
    assert 50 in indices
    # With keep_ratio=0.05 and 65 coeffs, k=4, so index 30 may also be retained
    # if there are ties among smaller magnitudes. We only assert the top two are present.
    assert len(indices) >= 2


def test_pack_unpack_roundtrip_lowpass():
    # Structured low-frequency-dominant signal mimics learned embeddings.
    # Real BJEPA dynamics/prior experts concentrate energy in low frequencies.
    t = np.linspace(0, 4 * np.pi, 128, dtype=np.float32)
    mu = (np.sin(t) + 0.5 * np.sin(3 * t) + 0.3 * np.cos(5 * t)).astype(np.float32)
    sigma = np.abs(np.sin(t) * 0.1).astype(np.float32)
    prior_mu = (np.cos(t * 0.5) + 0.4 * np.sin(7 * t)).astype(np.float32)
    prior_sigma = np.abs(np.cos(t * 0.5) * 0.05).astype(np.float32)

    for keep in [0.5, 0.25, 0.125]:
        packed = pack_belief(mu, sigma, prior_mu, prior_sigma, keep_ratio=keep, mask_mode="lowpass")
        rec = unpack_belief_and_invert(packed, original_dim=128)

        assert rec["mu"].shape == (128,)
        assert rec["sigma"].shape == (128,)
        assert rec["prior_mu"].shape == (128,)
        assert rec["prior_sigma"].shape == (128,)

        # Lowpass truncation preserves low-frequency structure well for
        # signals with spectral sparsity (like learned embeddings).
        mu_sim = cosine_similarity(mu, rec["mu"])
        pm_sim = cosine_similarity(prior_mu, rec["prior_mu"])
        threshold = 0.99 if keep >= 0.25 else 0.90
        assert mu_sim > threshold, f"keep={keep} mu_cos={mu_sim:.4f}"
        assert pm_sim > threshold, f"keep={keep} pm_cos={pm_sim:.4f}"


def test_pack_unpack_roundtrip_magnitude():
    # Magnitude mode is not supported in the binary wire format because the
    # TypeScript decoder assumes sequential lowpass packing. This test validates
    # spectral_mask magnitude selection in isolation.
    coeffs = np.zeros(128, dtype=np.complex64)
    coeffs[10] = 10.0 + 0j
    coeffs[50] = 5.0 + 0j
    coeffs[30] = 1.0 + 0j
    indices, masked = spectral_mask(coeffs, keep_ratio=0.05, mode="magnitude")
    assert 10 in indices
    assert 50 in indices
    assert len(indices) >= 2


def test_cosine_similarity_basic():
    a = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    b = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    assert math.isclose(cosine_similarity(a, b), 1.0, rel_tol=1e-5)

    a = np.array([1.0, 0.0], dtype=np.float32)
    b = np.array([0.0, 1.0], dtype=np.float32)
    assert math.isclose(cosine_similarity(a, b), 0.0, abs_tol=1e-5)


def test_pack_unpack_deterministic():
    mu = np.linspace(-1, 1, 128, dtype=np.float32)
    p1 = pack_belief(mu, keep_ratio=0.25)
    p2 = pack_belief(mu, keep_ratio=0.25)
    assert p1 == p2, "Packing should be deterministic"
    r1 = unpack_belief_and_invert(p1, original_dim=128)
    r2 = unpack_belief_and_invert(p2, original_dim=128)
    assert np.allclose(r1["mu"], r2["mu"])


def test_pack_empty_prior():
    t = np.linspace(0, 4 * np.pi, 128, dtype=np.float32)
    mu = (np.sin(t) + 0.5 * np.sin(3 * t)).astype(np.float32)
    packed = pack_belief(mu, None, None, None, keep_ratio=0.25)
    rec = unpack_belief_and_invert(packed, original_dim=128)
    assert cosine_similarity(mu, rec["mu"]) > 0.99
    assert np.allclose(rec["prior_mu"], 0.0)
    assert np.allclose(rec["prior_sigma"], 0.0)
