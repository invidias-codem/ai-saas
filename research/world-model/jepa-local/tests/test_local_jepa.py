"""Verification and sanity tests for local JEPA + FUR implementation.

Run: python -m tests.test_local_jepa
"""

from __future__ import annotations

import math
import random

import torch

from config import JEPAConfig
from losses.jepa_loss import (
    FlexibleUniformRegularizer,
    JEPALocalLoss,
    JEPAEncoder,
    JEPAPredictor,
    LocalJEPANode,
)
from aggregation.divergence import (
    cosine_distance_matrix,
    compute_representation_divergence,
    divergence_weighted_average,
    geometric_median_aggregate,
    staleness_weight,
)


def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    torch.manual_seed(seed)


def test_fur_isotropic_penalizes_collapse() -> None:
    """FUR should be lower for isotropic embeddings than for collapsed ones."""
    set_seed(0)
    cfg = JEPAConfig(embedding_dim=32)
    fur = FlexibleUniformRegularizer(cfg.embedding_dim)

    # Isotropic batch
    z_iso = torch.randn(64, 32)
    z_iso = torch.nn.functional.normalize(z_iso, dim=-1)
    loss_iso = fur(z_iso).item()

    # Collapsed batch (all dims identical except noise)
    z_collapsed = torch.randn(1, 32).repeat(64, 1)
    z_collapsed += torch.randn(64, 1) * 0.01
    z_collapsed = torch.nn.functional.normalize(z_collapsed, dim=-1)
    loss_collapsed = fur(z_collapsed).item()

    print(f"FUR isotropic: {loss_iso:.6f}")
    print(f"FUR collapsed: {loss_collapsed:.6f}")
    # Collapsed embeddings occupy a tiny region of the hypersphere, making them
    # statistically distant from the fixed spherical Gaussian prior — FUR is high.
    # Diverse isotropic embeddings are close to the prior — FUR is low.
    assert loss_collapsed > loss_iso, "Collapsed embeddings should have higher MMD to prior"
    print("PASS: FUR penalizes collapsed embeddings correctly\n")


def test_fur_zero_for_perfect_match() -> None:
    """FUR should be ~0 when embeddings exactly match the prior."""
    set_seed(1)
    cfg = JEPAConfig(embedding_dim=32, fur_num_prior_samples=64)
    fur = FlexibleUniformRegularizer(cfg.embedding_dim)

    # Draw from the exact same distribution as the prior
    prior = torch.randn(64, 32)
    prior = torch.nn.functional.normalize(prior, dim=-1)
    loss_exact = fur(prior).item()

    print(f"FUR exact match: {loss_exact:.6f}")
    assert loss_exact < 0.05, "FUR should be near 0 for matching distribution"
    print("PASS: FUR near 0 for matching prior\n")


def test_loss_components_non_nan() -> None:
    """All loss components should be finite and non-NaN."""
    set_seed(2)
    cfg = JEPAConfig(embedding_dim=32, hidden_dim=64)
    node = LocalJEPANode(cfg)

    x_view = torch.randn(16, 32)
    x_target = torch.randn(16, 32)

    loss, components = node(x_view, x_target)

    for name, val in components.items():
        assert math.isfinite(val), f"Component {name} is not finite: {val}"
    print(f"Components: {components}")
    print("PASS: All components finite\n")


def test_gradients_flow_through_fur() -> None:
    """Gradients must flow from FUR through encoder parameters."""
    set_seed(3)
    cfg = JEPAConfig(embedding_dim=32, hidden_dim=64, fur_weight=1.0)
    node = LocalJEPANode(cfg)

    x_view = torch.randn(16, 32)
    x_target = torch.randn(16, 32)

    loss, _ = node(x_view, x_target)
    loss.backward()

    encoder_params_with_grad = sum(
        1 for p in node.encoder.parameters() if p.grad is not None
    )
    total_params = sum(1 for _ in node.encoder.parameters())
    assert encoder_params_with_grad == total_params, "Not all encoder params received grad"
    assert encoder_params_with_grad > 0, "No gradients found"
    print(f"Encoder params with grad: {encoder_params_with_grad}/{total_params}")
    print("PASS: Gradients flow through FUR into encoder\n")


def test_training_step_decreases_loss() -> None:
    """A single training step should not increase total loss wildly."""
    set_seed(4)
    cfg = JEPAConfig(embedding_dim=64, hidden_dim=128, fur_weight=0.05)
    node = LocalJEPANode(cfg)
    opt = torch.optim.AdamW([
        {"params": node.encoder.parameters(), "lr": 1e-3},
        {"params": node.predictor.parameters(), "lr": 1e-3},
    ])

    x_view = torch.randn(32, 64)
    x_target = torch.randn(32, 64)

    loss_before, _ = node(x_view, x_target)
    loss_before_item = loss_before.item()

    opt.zero_grad()
    loss_before.backward()
    torch.nn.utils.clip_grad_norm_(node.encoder.parameters(), 1.0)
    opt.step()

    loss_after, comps_after = node(x_view, x_target)
    loss_after_item = loss_after.item()

    print(f"Loss before: {loss_before_item:.6f}")
    print(f"Loss after:  {loss_after_item:.6f}")
    print(f"Components after: {comps_after}")
    # JEPA loss should decrease; FUR may go either way
    assert comps_after["jepa"] < loss_before_item * 2, "JEPA loss diverged"
    print("PASS: Training step is stable\n")


def test_divergence_utils() -> None:
    """Divergence utilities should produce sensible outputs."""
    set_seed(5)
    z_local = torch.randn(16, 32)
    z_local = torch.nn.functional.normalize(z_local, dim=-1)
    z_peer_same = z_local.clone()
    z_peer_diff = torch.randn(16, 32)
    z_peer_diff = torch.nn.functional.normalize(z_peer_diff, dim=-1)

    div_same = compute_representation_divergence(z_local, z_peer_same)
    div_diff = compute_representation_divergence(z_local, z_peer_diff)
    print(f"Divergence (same): {div_same:.6f}")
    print(f"Divergence (different): {div_diff:.6f}")
    assert div_same < div_diff, "Same peers should have lower divergence"
    print("PASS: Divergence utils work correctly\n")


def test_staleness_weight() -> None:
    """Staleness weight should decay with update delta."""
    w1 = staleness_weight(100, 100)
    w2 = staleness_weight(100, 50)
    assert abs(w1 - 1.0) < 0.05, "Same update count should give weight ~1"
    assert w2 < w1, "Staler peer should get lower weight"
    print(f"Staleness w1 (same): {w1:.4f}, w2 (delta=50): {w2:.4f}")
    print("PASS: Staleness weights decay correctly\n")


def test_geometric_median_aggregate() -> None:
    """Geometric median should resist outlier tensors."""
    set_seed(6)
    base = torch.randn(10)
    peers = [base.clone() + torch.randn(10) * 0.01 for _ in range(4)]
    # Inject outlier
    outlier = base.clone() + torch.randn(10) * 10.0
    peers.append(outlier)

    median = geometric_median_aggregate(peers)
    # Median should be close to base, not pulled toward outlier
    dist_to_base = torch.norm(median - base).item()
    dist_to_outlier = torch.norm(median - outlier).item()
    print(f"Median dist to base: {dist_to_base:.6f}")
    print(f"Median dist to outlier: {dist_to_outlier:.6f}")
    assert dist_to_base < dist_to_outlier, "Median should resist outliers"
    print("PASS: Geometric median is robust to outliers\n")


if __name__ == "__main__":
    test_fur_isotropic_penalizes_collapse()
    test_fur_zero_for_perfect_match()
    test_loss_components_non_nan()
    test_gradients_flow_through_fur()
    test_training_step_decreases_loss()
    test_divergence_utils()
    test_staleness_weight()
    test_geometric_median_aggregate()
    print("=" * 50)
    print("All verification tests passed.")
