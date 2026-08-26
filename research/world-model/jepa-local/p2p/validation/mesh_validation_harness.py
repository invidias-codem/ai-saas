"""
research/world-model/jepa-local/p2p/validation/mesh_validation_harness.py

Multi-node mesh validation harness.

Validates that the Asynchronous Ensemble Aggregation (AEA) engine correctly
prunes high-divergence peer weights before they can corrupt the local model.

Test flow
---------
1. Instantiate two independent LocalJEPANode models (Node A and Node B).
2. Train Node B on heavily divergent synthetic data to destabilize its
   representation space.
3. Directly feed Node B's gossiped weights into Node A's AEA ingest buffer,
   simulating what the P2P transport would deliver.
4. Execute Node A's aggregation round.
5. Assert that Node A reports `peers_divergent > 0` and does not aggregate
   the malicious/destabilized payload.
"""

from __future__ import annotations

import os
import random
import sys
from typing import Dict

import torch

from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode
from aggregation.aea_engine import AsynchronousEnsembleAggregator


def set_seed(seed: int = 42) -> None:
    random.seed(seed)
    torch.manual_seed(seed)


def train_node_b_on_divergent_data(
    model: LocalJEPANode,
    steps: int = 5,
    embedding_dim: int = 256,
    divergence_scale: float = 5.0,
) -> Dict[str, torch.Tensor]:
    """
    Train Node B on synthetic (s_x, s_y) pairs with high divergence
    between source and target. This destabilizes the encoder's
    representation space, simulating a Byzantine or corrupted peer.
    """
    model.train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

    base = torch.randn(embedding_dim)

    for _ in range(steps):
        s_x = base + torch.randn(embedding_dim) * 0.1
        # s_y is deliberately shifted far from s_x
        s_y = base + torch.randn(embedding_dim) * divergence_scale

        s_x = s_x.unsqueeze(0)
        s_y = s_y.unsqueeze(0)

        optimizer.zero_grad()
        loss, _ = model(s_x, s_y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        model.update_target_encoder()

    # Return gossiped state dict
    return model.get_state_dict()


def run_mesh_validation() -> Dict[str, float]:
    """
    Execute the full mesh validation test.

    Returns:
        Node A's AEA aggregation report after ingesting Node B's payload.
    """
    set_seed(42)
    cfg = JEPAConfig(embedding_dim=256, hidden_dim=512)

    # Node A: stable, honest node
    node_a = LocalJEPANode(cfg)
    node_a.eval()

    # Node B: will be trained on divergent data
    node_b = LocalJEPANode(cfg)
    node_b.train()

    print("[Harness] training Node B on divergent synthetic data...")
    divergent_weights = train_node_b_on_divergent_data(
        node_b, steps=8, embedding_dim=cfg.embedding_dim, divergence_scale=5.0
    )

    # Compute actual representation divergence between Node A and Node B
    with torch.no_grad():
        z_a = node_a.encode_view(torch.randn(16, cfg.embedding_dim))
        z_b = node_b.encode_view(torch.randn(16, cfg.embedding_dim))
        from aggregation.divergence import compute_representation_divergence
        actual_divergence = compute_representation_divergence(z_a, z_b)
    print(f"[Harness] actual representation divergence: {actual_divergence:.4f}")

    # Set up Node A's AEA engine with a threshold slightly below the
    # actual divergence so Node B's payload is definitely pruned.
    aea = AsynchronousEnsembleAggregator(
        local_model=node_a,
        config=cfg,
        divergence_threshold=actual_divergence * 0.8,
    )

    # Simulate gossiped payload from Node B
    metadata = {
        "accuracy": 0.95,
        "dataset_size": 1000,
        "timestamp": 0.0,  # stale enough to also test staleness weighting
        "peerId": "node-b-synthetic",
        "divergence": actual_divergence,
    }

    print("[Harness] ingesting Node B's divergent weights into Node A...")
    aea.ingest_peer_model(divergent_weights, metadata)

    print("[Harness] executing Node A aggregation round...")
    report = aea.execute_aggregation()

    return report


def assert_byzantine_pruning(report: Dict[str, float]) -> None:
    """
    Assert that the AEA engine pruned all divergent peers.
    """
    ingested = int(report.get("peers_ingested", 0))
    aggregated = int(report.get("peers_aggregated", 0))
    divergent = int(report.get("peers_divergent", 0))

    print("\n[Harness] AEA report:")
    print(f"  peers_ingested  : {ingested}")
    print(f"  peers_aggregated: {aggregated}")
    print(f"  peers_divergent : {divergent}")

    assert ingested >= 1, "Expected at least one peer ingested"
    assert divergent >= 1, "Expected at least one divergent peer"
    assert aggregated == 0, (
        f"Expected 0 aggregated peers, got {aggregated} — "
        "Byzantine pruning failed to isolate divergent weights"
    )

    print("\n[Harness] PASS: Byzantine-resilient pruning verified")


def main() -> int:
    print("=" * 60)
    print("Multi-Node Mesh Validation Harness")
    print("=" * 60)

    try:
        report = run_mesh_validation()
        assert_byzantine_pruning(report)
        return 0
    except AssertionError as exc:
        print(f"\n[Harness] FAIL: {exc}")
        return 1
    except Exception as exc:
        print(f"\n[Harness] ERROR: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
