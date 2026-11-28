"""
Asynchronous Ensemble Aggregation (AEA) engine for P2P JEPA gossip learning.

Decouples local training from network synchronization using a non-blocking
ingestion buffer. Implements weighted averaging + trimmed mean for Byzantine
resilience against adversarial or corrupted peer updates.
"""

from __future__ import annotations

import time
from typing import Dict, List, Tuple

import torch
import torch.nn as nn

from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode


class AsynchronousEnsembleAggregator:
    """
    Engine for Asynchronous Ensemble Aggregation (AEA) in P2P JEPA networks.

    Non-blocking ingestion buffer collects gossiped peer models. When
    `execute_aggregation()` is called (e.g. at end of local epoch), the
    engine applies divergence-aware weighted averaging with trimmed-mean
    outlier rejection, then updates the local model.

    Byzantine resilience comes from two mechanisms:
    1. Trimmed mean: drops extreme parameter values per layer
    2. Divergence pruning: excludes peers whose representation space
       diverges too far from the local model
    """

    def __init__(
        self,
        local_model: LocalJEPANode,
        config: JEPAConfig,
        base_alpha: float = 0.5,
        staleness_decay: float = 0.9,
        trim_ratio: float = 0.1,
        divergence_threshold: float = 0.5,
    ):
        """
        Args:
            local_model: The local JEPA node whose state gets updated
            config: JEPAConfig for hyperparameters
            base_alpha: Mixing weight for local model vs consensus
            staleness_decay: Exponential decay per unit of staleness
            trim_ratio: Fraction of extreme peers to drop per layer
            divergence_threshold: Max cosine divergence before peer exclusion
        """
        self.local_model = local_model
        self.config = config
        self.base_alpha = base_alpha
        self.staleness_decay = staleness_decay
        self.trim_ratio = trim_ratio
        self.divergence_threshold = divergence_threshold

        # Non-blocking ingestion buffer
        self.peer_buffer: List[Tuple[Dict[str, torch.Tensor], dict]] = []
        self.current_round_timestamp = time.time()

    def ingest_peer_model(
        self,
        peer_weights: Dict[str, torch.Tensor],
        metadata: dict,
    ) -> None:
        """
        Non-blocking ingestion of a gossiped model from a neighboring peer.

        Call from the network receive handler; never blocks training.

        Expected metadata keys:
            accuracy: float in [0, 1]
            dataset_size: float > 0
            timestamp: float (unix epoch)
            divergence: float (optional, precomputed angular divergence)
        """
        self.peer_buffer.append((peer_weights, metadata))

    def _calculate_peer_weight(self, metadata: dict) -> float:
        """
        Calculate an aggregation scalar from cryptographic/network metadata.

        Combines accuracy, dataset size, and staleness into a single weight.
        """
        # Staleness-based weighting
        peer_ts = metadata.get("timestamp", self.current_round_timestamp)
        time_diff = max(0.0, self.current_round_timestamp - peer_ts)
        staleness_penalty = self.staleness_decay ** time_diff

        # Accuracy and dataset size weighting
        accuracy = metadata.get("accuracy", 0.5)
        dataset_size = metadata.get("dataset_size", 1.0)

        return float(accuracy * dataset_size * staleness_penalty)

    def _is_peer_divergent(self, metadata: dict) -> bool:
        """Reject peers with known divergence above threshold."""
        divergence = metadata.get("divergence", 0.0)
        return divergence > self.divergence_threshold

    def _trimmed_mean_aggregation(
        self,
        weighted_peers: List[Tuple[Dict[str, torch.Tensor], float]],
    ) -> Dict[str, torch.Tensor]:
        """
        Apply trimmed mean per layer to drop outlier models.

        Skips non-tensor values (e.g. config objects) so nested state dicts
        with metadata fields are handled safely.
        """
        aggregated_weights: Dict[str, torch.Tensor] = {}
        state_keys = list(weighted_peers[0][0].keys())

        for key in state_keys:
            sample = weighted_peers[0][0][key]
            if not isinstance(sample, torch.Tensor):
                # Preserve non-tensor metadata as-is (e.g. config object)
                aggregated_weights[key] = sample
                continue

            # Stack peers: (N, ...)
            layer_tensors = torch.stack([peer[0][key] for peer in weighted_peers])
            num_peers = len(weighted_peers)
            trim_count = int(num_peers * self.trim_ratio)

            if trim_count > 0 and num_peers > 2 * trim_count:
                sorted_tensors, _ = torch.sort(layer_tensors, dim=0)
                trimmed_tensors = sorted_tensors[trim_count:-trim_count]
                aggregated_weights[key] = trimmed_tensors.mean(dim=0)
            else:
                total_weight = sum(w for _, w in weighted_peers)
                weighted_sum = torch.zeros_like(sample)
                for peer_weights, w in weighted_peers:
                    weighted_sum += peer_weights[key] * (w / total_weight)
                aggregated_weights[key] = weighted_sum

        return aggregated_weights

    def execute_aggregation(self) -> Dict[str, float]:
        """
        Execute aggregation pipeline and update the local model.

        Should be called periodically (e.g. at end of local epoch).
        Non-blocking ingestion continues independently.

        Returns:
            Aggregation report dict with counts and mean weight
        """
        report: Dict[str, float] = {
            "peers_ingested": 0.0,
            "peers_aggregated": 0.0,
            "peers_divergent": 0.0,
            "mean_weight": 0.0,
        }

        if not self.peer_buffer:
            return report

        report["peers_ingested"] = float(len(self.peer_buffer))

        # Prune divergent peers, compute weights
        weighted_peers: List[Tuple[Dict[str, torch.Tensor], float]] = []
        for peer_weights, metadata in self.peer_buffer:
            if self._is_peer_divergent(metadata):
                report["peers_divergent"] += 1.0
                continue
            peer_weight = self._calculate_peer_weight(metadata)
            weighted_peers.append((peer_weights, peer_weight))

        if not weighted_peers:
            self.peer_buffer.clear()
            return report

        # Byzantine-resilient aggregation
        consensus_weights = self._trimmed_mean_aggregation(weighted_peers)

        # Update local model
        local_state = self.local_model.state_dict()
        for key in local_state.keys():
            if key in consensus_weights:
                local_state[key] = (
                    self.base_alpha * local_state[key]
                    + (1.0 - self.base_alpha) * consensus_weights[key]
                )
        self.local_model.load_state_dict(local_state)

        # Update target encoder via EMA to match new source encoder
        self.local_model.update_target_encoder()

        report["peers_aggregated"] = float(len(weighted_peers))
        report["mean_weight"] = (
            sum(w for _, w in weighted_peers) / len(weighted_peers)
        )

        # Reset buffer and timestamp for next async window
        self.peer_buffer.clear()
        self.current_round_timestamp = time.time()

        return report
