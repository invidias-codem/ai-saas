"""JEPA Local Objective Function with Flexible Uniform Regularizer (FUR)."""
from __future__ import annotations

from typing import Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from config import JEPAConfig


class JEPAEncoder(nn.Module):
    """Local encoder: maps input views to latent representations."""

    def __init__(self, embedding_dim: int = 256, hidden_dim: int = 512):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embedding_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, embedding_dim),
        )
        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class JEPAPredictor(nn.Module):
    """Predictor: predicts target encoder output from source encoder output."""

    def __init__(
        self,
        embedding_dim: int = 256,
        hidden_dim: int = 512,
        depth: int = 4,
    ):
        super().__init__()
        layers = []
        dim_in = embedding_dim
        for _ in range(depth - 1):
            layers.extend([
                nn.Linear(dim_in, hidden_dim),
                nn.LayerNorm(hidden_dim),
                nn.GELU(),
            ])
            dim_in = hidden_dim
        layers.append(nn.Linear(dim_in, embedding_dim))
        self.net = nn.Sequential(*layers)
        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        return self.net(z)


class FlexibleUniformRegularizer(nn.Module):
    """
    FUR: enforces spherical Gaussian geometry on local embeddings.

    Uses kernel Maximum Mean Discrepancy (MMD) to measure divergence between
    the empirical embedding distribution and a fixed spherical Gaussian prior.
    This directly penalizes representation collapse by forcing embeddings to
    utilize the full hypersphere uniformly.

    L_FUR = MMD²(Embeddings, N(0, I))  via Gaussian RBF kernel

    The isotropic prior is sampled once at init and kept fixed, providing a
    stable optimization target regardless of local data distribution skew.
    """

    def __init__(
        self,
        embedding_dim: int,
        num_prior_samples: int = 256,
        bandwidth: float | None = None,
    ):
        super().__init__()
        self.embedding_dim = embedding_dim

        # Fixed spherical Gaussian prior — stable optimization target
        prior = torch.randn(num_prior_samples, embedding_dim)
        self.register_buffer("prior_samples", F.normalize(prior, dim=-1))

        # Auto bandwidth: median pairwise distance of prior
        if bandwidth is None:
            with torch.no_grad():
                dists = torch.cdist(self.prior_samples, self.prior_samples)
                mask = ~torch.eye(num_prior_samples, dtype=torch.bool)
                bandwidth = dists.masked_select(mask).median().item()
        self.register_buffer("bandwidth", torch.tensor(bandwidth))

    def _rbf_kernel(self, x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
        """Gaussian RBF kernel: k(x,y) = exp(-||x-y||² / (2σ²))."""
        dists_sq = torch.cdist(x, y).pow(2)
        return torch.exp(-dists_sq / (2.0 * self.bandwidth ** 2))

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        """
        Compute FUR loss via kernel MMD.

        Args:
            embeddings: (B, D) tensor of normalized latent embeddings

        Returns:
            Scalar MMD² divergence from spherical Gaussian
        """
        B = embeddings.shape[0]

        # Clamp batch size to avoid empty batches
        if B < 2:
            return embeddings.new_tensor(0.0)

        # Kernel matrices
        K_ee = self._rbf_kernel(embeddings, embeddings)
        K_ep = self._rbf_kernel(embeddings, self.prior_samples)
        K_pp = self._rbf_kernel(self.prior_samples, self.prior_samples)

        # Biased MMD² estimator (Gretton et al., 2012)
        # E[k(X,X')] + E[k(Y,Y')] - 2 E[k(X,Y)]
        # Biased estimator is more stable for finite samples; the diagonal
        # entries (k(x,x)=1) are always positive and stabilize the estimate.
        mmd = K_ee.mean() + K_pp.mean() - 2.0 * K_ep.mean()

        return mmd


class JEPALocalLoss(nn.Module):
    """
    Composite local JEPA objective with FUR integration.

    Prevents representation collapse entanglement by enforcing isotropic
    feature spaces before gossip aggregation in P2P networks.

    Usage
    -----
    config = JEPAConfig(embedding_dim=256)
    loss_fn = JEPALocalLoss(config)

    # Forward pass through encoders
    z_view = encoder(x_view)
    z_target = target_encoder(x_target)

    # Compute loss
    loss, components = loss_fn(z_view, z_target, predictor)

    # Backward
    loss.backward()
    torch.nn.utils.clip_grad_norm_(params, config.max_grad_norm)
    """

    def __init__(self, config: JEPAConfig):
        super().__init__()
        self.config = config
        self.fur = FlexibleUniformRegularizer(config.embedding_dim)

    def forward(
        self,
        z_view: torch.Tensor,
        z_target: torch.Tensor,
        predictor: nn.Module,
    ) -> Tuple[torch.Tensor, dict]:
        """
        Compute composite local loss.

        Args:
            z_view: Encoded view from local encoder (B, D)
            z_target: Encoded target from target encoder (B, D)
            predictor: Local predictor network

        Returns:
            total_loss: Weighted sum of all loss terms
            components: Dict with individual loss values for logging
        """
        B, D = z_view.shape
        components: dict[str, float] = {}

        # === L_JEPA: latent prediction loss ===
        z_pred = predictor(z_view)
        l_jepa = F.mse_loss(z_pred, z_target.detach())
        components["jepa"] = float(l_jepa.item())

        # === L_FUR: isotropic feature regularization ===
        # Apply to normalized embeddings for numerical stability
        z_norm = F.normalize(z_view, dim=-1)
        l_fur = self.fur(z_norm)
        components["fur"] = l_fur.item()

        # === L_predictor: optional predictor weight decay ===
        l_pred = sum(p.pow(2).sum() for p in predictor.parameters())
        l_pred = l_pred / max(1, sum(p.numel() for p in predictor.parameters()))
        components["predictor"] = float(l_pred.item())

        # === Composite ===
        total = (
            self.config.jepa_weight * l_jepa
            + self.config.fur_weight * l_fur
            + self.config.predictor_weight * l_pred
        )
        components["total"] = total.item()

        return total, components


class LocalJEPANode(nn.Module):
    """
    Complete local JEPA node for P2P gossip participation.

    Encapsulates the full local training unit: encoder, target encoder (EMA),
    predictor, and composite loss with FUR.

    The target encoder is updated via exponential moving average of the
    source encoder, preventing representation collapse in centralized settings
    and providing a stable training target in decentralized settings.
    """

    def __init__(self, config: JEPAConfig):
        super().__init__()
        self.config = config
        self.encoder = JEPAEncoder(config.embedding_dim, config.hidden_dim)
        self.target_encoder = JEPAEncoder(config.embedding_dim, config.hidden_dim)
        self.predictor = JEPAPredictor(
            config.embedding_dim,
            config.hidden_dim,
            config.predictor_depth,
        )
        self.loss_fn = JEPALocalLoss(config)

        # Initialize target encoder as copy of source encoder
        self._sync_target_encoder()

    def _sync_target_encoder(self) -> None:
        """Copy source encoder weights to target encoder."""
        self.target_encoder.load_state_dict(self.encoder.state_dict())

    @torch.no_grad()
    def update_target_encoder(self) -> None:
        """
        Update target encoder via exponential moving average.

        θ_target ← τ * θ_target + (1 - τ) * θ_encoder

        The EMA prevents trivial solutions and provides a stable,
        slowly-moving target for the predictor.
        """
        tau = self.config.ema_tau
        for target_param, source_param in zip(
            self.target_encoder.parameters(),
            self.encoder.parameters(),
        ):
            target_param.data.mul_(tau).add_(source_param.data, alpha=1 - tau)

    def encode_view(self, x: torch.Tensor) -> torch.Tensor:
        """Encode a data view through the local encoder."""
        return self.encoder(x)

    def encode_target(self, x: torch.Tensor) -> torch.Tensor:
        """Encode a target view through the target encoder (no grad)."""
        with torch.no_grad():
            return self.target_encoder(x)

    def forward(
        self,
        x_view: torch.Tensor,
        x_target: torch.Tensor,
    ) -> Tuple[torch.Tensor, dict]:
        """
        Full forward pass: encode → predict → compute loss.

        Args:
            x_view: Source view input (B, input_dim)
            x_target: Target view input (B, input_dim)

        Returns:
            total_loss, components
        """
        z_view = self.encode_view(x_view)
        z_target = self.encode_target(x_target)
        return self.loss_fn(z_view, z_target, self.predictor)

    @torch.no_grad()
    def get_state_dict(self) -> dict:
        """Return model state for gossip broadcast."""
        return {
            "encoder": self.encoder.state_dict(),
            "predictor": self.predictor.state_dict(),
            "target_encoder": self.target_encoder.state_dict(),
        }

    def load_state(self, state: dict) -> None:
        """Load model state from gossip aggregation."""
        self.encoder.load_state_dict(state["encoder"])
        self.predictor.load_state_dict(state["predictor"])
        self.target_encoder.load_state_dict(state["target_encoder"])


def cosine_distance_matrix(z: torch.Tensor) -> torch.Tensor:
    """
    Compute pairwise cosine distance matrix.

    Used by divergence-aware aggregation to detect misaligned peers.

    Args:
        z: (N, D) embeddings from N peers

    Returns:
        (N, N) cosine distance matrix
    """
    z_norm = F.normalize(z, dim=-1)
    return 1.0 - (z_norm @ z_norm.T)


def compute_representation_divergence(
    local_embeddings: torch.Tensor,
    peer_embeddings: torch.Tensor,
) -> float:
    """
    Measure angular divergence between local and peer representation spaces.

    Low divergence → safe to aggregate; high divergence → potential
    collapse entanglement or adversarial weights.

    Args:
        local_embeddings: (B_local, D) from this node
        peer_embeddings: (B_peer, D) from gossiping peer

    Returns:
        Scalar divergence score [0, 2]
    """
    z_local = F.normalize(local_embeddings.mean(dim=0), dim=0)
    z_peer = F.normalize(peer_embeddings.mean(dim=0), dim=0)
    cosine_sim = (z_local * z_peer).sum()
    return float(1.0 - cosine_sim.item())
