"""
Divergence-aware aggregation utilities for P2P JEPA gossip learning.

Measures inter-client model divergence to weight aggregation and detect
misaligned or adversarial peers before their updates corrupt the local node.
"""

from __future__ import annotations

import math

import torch
import torch.nn.functional as F


def cosine_distance_matrix(z: torch.Tensor) -> torch.Tensor:
    """
    Compute pairwise cosine distance matrix for a set of peer embeddings.

    Args:
        z: (N, D) embeddings from N peers

    Returns:
        (N, N) cosine distance matrix where entry (i,j) = 1 - cos(z_i, z_j)
    """
    z_norm = F.normalize(z, dim=-1)
    return 1.0 - (z_norm @ z_norm.T)


def compute_representation_divergence(
    local_embeddings: torch.Tensor,
    peer_embeddings: torch.Tensor,
) -> float:
    """
    Measure angular divergence between local and peer representation spaces.

    Uses the cosine distance between the mean-centered embedding directions.
    Low divergence → safe to aggregate; high divergence → potential
    collapse entanglement or adversarial weights.

    Args:
        local_embeddings: (B_local, D) from this node's recent batch
        peer_embeddings: (B_peer, D) from gossiping peer

    Returns:
        Scalar divergence score in [0, 2]
    """
    z_local = F.normalize(local_embeddings.mean(dim=0), dim=0)
    z_peer = F.normalize(peer_embeddings.mean(dim=0), dim=0)
    cosine_sim = (z_local * z_peer).sum()
    return float(1.0 - cosine_sim.item())


@torch.no_grad()
def staleness_weight(
    local_update_count: int,
    peer_update_count: int,
    staleness_lambda: float = 0.1,
) -> float:
    """
    Compute staleness-aware weight for gossip aggregation.

    More recent models receive higher weight. Prevents stale weights
    from dominating the local model in asynchronous settings.

    Args:
        local_update_count: Number of local gradient updates completed
        peer_update_count: Number of updates peer has completed
        staleness_lambda: Decay rate for staleness penalty

    Returns:
        Weight in [0, 1]
    """
    delta = max(0, local_update_count - peer_update_count)
    return math.exp(-staleness_lambda * delta)


def geometric_median_aggregate(
    weight_updates: list[torch.Tensor],
    max_iter: int = 50,
    tol: float = 1e-5,
) -> torch.Tensor:
    """
    Compute geometric median of multiple weight tensors.

    Byzantine-resilient aggregation: replaces arithmetic mean with
    geometric median to reject outlier updates from malicious peers.

    Uses Weiszfeld's algorithm for robust estimation.

    Args:
        weight_updates: List of flattened weight tensors from peers
        max_iter: Maximum Weiszfeld iterations
        tol: Convergence tolerance

    Returns:
        Flattened geometric median tensor
    """
    if not weight_updates:
        raise ValueError("weight_updates list cannot be empty")

    stacked = torch.stack(weight_updates, dim=0)  # (N, D)
    median = stacked.mean(dim=0)  # Initial guess: mean

    for _ in range(max_iter):
        # Compute distances from current median to all points
        dists = torch.norm(stacked - median.unsqueeze(0), dim=1)  # (N,)

        # Avoid division by zero
        dists = torch.clamp(dists, min=1e-10)

        # Weiszfeld update: weighted average with 1/distance weights
        weights = 1.0 / dists
        weights = weights / weights.sum()

        new_median = (weights.unsqueeze(1) * stacked).sum(dim=0)

        if torch.norm(new_median - median) < tol:
            break
        median = new_median

    return median


def divergence_weighted_average(
    local_params: dict[str, torch.Tensor],
    peer_params_list: list[dict[str, torch.Tensor]],
    divergence_scores: list[float],
    staleness_weights: list[float] | None = None,
    divergence_threshold: float = 0.5,
    min_weight: float = 0.01,
) -> dict[str, torch.Tensor]:
    """
    Weighted aggregation with divergence-based pruning.

    Peers with divergence above the threshold are excluded entirely.
    Remaining peers are weighted by normalized staleness and inverse divergence.

    Args:
        local_params: Local model state dict
        peer_params_list: List of peer state dicts
        divergence_scores: Per-peer divergence scores
        staleness_weights: Optional per-peer staleness weights
        divergence_threshold: Max divergence before peer is excluded
        min_weight: Minimum weight floor to maintain local model influence

    Returns:
        Aggregated state dict
    """
    valid_peers = []
    valid_weights = []

    for i, (peer_params, div_score) in enumerate(
        zip(peer_params_list, divergence_scores)
    ):
        if div_score > divergence_threshold:
            continue

        staleness = (
            staleness_weights[i]
            if staleness_weights is not None
            else 1.0
        )
        # Weight inversely proportional to divergence
        weight = staleness / (div_score + 1e-8)
        valid_peers.append(peer_params)
        valid_weights.append(weight)

    if not valid_peers:
        # No valid peers — retain local params only
        return {k: v.clone() for k, v in local_params.items()}

    # Normalize weights
    w_sum = sum(valid_weights) + min_weight
    valid_weights = [(w + min_weight) / w_sum for w in valid_weights]

    # Weighted average per parameter
    aggregated = {}
    for key in local_params.keys():
        agg = local_params[key].clone() * min_weight
        for peer_params, weight in zip(valid_peers, valid_weights):
            agg += peer_params[key] * weight
        aggregated[key] = agg

    return aggregated
