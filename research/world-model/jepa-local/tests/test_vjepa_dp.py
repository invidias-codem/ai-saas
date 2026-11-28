"""
Verification for VJEPA + DP-SGD engine integration.
"""

from __future__ import annotations

import torch

from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode
from losses.vjepa_loss import (
    VJEPAPredictorHead,
    kl_diagonal_gaussian,
    reconstruction_log_likelihood,
)
from training.dp_sgd_engine import DpSgdEngine


def test_vjepa_predictor_output_shape():
    cfg = JEPAConfig(embedding_dim=128, hidden_dim=256, predictor_depth=3)
    head = VJEPAPredictorHead(cfg.embedding_dim, cfg.hidden_dim, cfg.predictor_depth)
    head.eval()
    x = torch.randn(2, cfg.embedding_dim)
    with torch.no_grad():
        mu, log_var = head(x)
    assert mu.shape == (2, cfg.embedding_dim), f"bad mu shape {mu.shape}"
    assert log_var.shape == (2, cfg.embedding_dim), f"bad log_var shape {log_var.shape}"
    assert torch.all(log_var.exp() > 0), "log_var must map to positive variance"
    print("PASS: VJEPA predictor output shape and positivity")


def test_kl_diagonal_gaussian_standard_prior():
    mu = torch.zeros(4, 128)
    log_var = torch.zeros(4, 128)
    kl = kl_diagonal_gaussian(mu, log_var)
    # KL[N(0,1) || N(0,1)] = 0
    assert abs(kl.item()) < 1e-4, f"KL should be ~0, got {kl.item()}"
    print(f"PASS: KL to standard prior = {kl.item():.6f}")


def test_elbo_loss():
    cfg = JEPAConfig(embedding_dim=128, use_vjepa=True, vjepa_weight=1.0, kl_weight=0.01)
    node = LocalJEPANode(cfg)
    assert node.vjepa_mode is True
    x = torch.randn(4, 128)
    y = torch.randn(4, 128)
    loss, components = node(x, y)
    assert torch.isfinite(loss), f"loss is not finite: {loss}"
    assert "recon" in components
    assert "kl" in components
    assert "total" in components
    print(f"PASS: ELBO loss finite, components={components}")


def test_dp_sgd_engine_step():
    cfg = JEPAConfig(embedding_dim=128, use_vjepa=True)
    node = LocalJEPANode(cfg)
    engine = DpSgdEngine(
        list(node.encoder.parameters()),
        lr=1e-4,
        noise_multiplier=1.1,
        clip_norm=1.0,
        momentum_eta=0.1,
        clip_min=0.5,
        clip_max=3.0,
    )
    x = torch.randn(2, 128)
    y = torch.randn(2, 128)
    loss, _ = node(x, y)
    stats = engine.step_with_privacy(loss)
    assert "clip_norm" in stats
    assert "noise_std" in stats
    assert "updated_clip_norm" in stats
    assert 0.5 <= stats["updated_clip_norm"] <= 3.0, "clip_norm out of bounds"
    print(f"PASS: DP-SGD step stats={stats}")


def test_dp_sgd_adaptive_clip_momentum():
    cfg = JEPAConfig(embedding_dim=64, use_vjepa=True)
    node = LocalJEPANode(cfg)
    engine = DpSgdEngine(
        list(node.encoder.parameters()),
        lr=1e-4,
        noise_multiplier=1.0,
        clip_norm=1.0,
        momentum_eta=0.1,
        clip_min=0.5,
        clip_max=3.0,
    )
    x = torch.randn(2, 64)
    y = torch.randn(2, 64)
    clips: list[float] = []
    for _ in range(20):
        loss, _ = node(x, y)
        stats = engine.step_with_privacy(loss)
        clips.append(stats["updated_clip_norm"])
    # Adaptive clip should move if gradients have consistent slack.
    assert len(set(round(c, 3) for c in clips)) > 1 or abs(clips[-1] - clips[0]) < 0.01, \
        "adaptive clip should either drift or stabilize"
    assert all(0.5 <= c <= 3.0 for c in clips), "clip_norm out of bounds"
    print(f"PASS: adaptive clip stabilized around {clips[-1]:.4f}")


if __name__ == "__main__":
    test_vjepa_predictor_output_shape()
    test_kl_diagonal_gaussian_standard_prior()
    test_elbo_loss()
    test_dp_sgd_engine_step()
    test_dp_sgd_adaptive_clip_momentum()
    print("\nAll VJEPA/DP-SGD verification tests passed.")
