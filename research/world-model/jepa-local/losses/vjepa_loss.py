"""
VJEPA Loss Module
=================

Variational Joint Embedding Predictive Architecture (VJEPA) loss.

Replaces the deterministic MSE predictor with a probabilistic Gaussian
predictor head. Training maximizes the Evidence Lower Bound (ELBO):

  L_ELBO = -E_q[log p(z_target | z_view)] + KL[q(z | z_view) || p(z)]

where:
  - q(z | z_view) = N(mu(z_view), sigma(z_view)) is the amortized
    variational distribution parameterized by the predictor.
  - p(z_target | z_view) is the likelihood of the target encoder output.
  - p(z) = N(0, I) is the unit Gaussian prior.

A diagonal covariance is used to keep the predictor head lightweight
and to align with the sparse-variance export strategy for WASM.
"""

from __future__ import annotations

from typing import Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from config import JEPAConfig


class VJEPAPredictorHead(nn.Module):
    """
    Probabilistic predictor: maps source latent to a diagonal Gaussian
    over the target latent.

    Outputs:
      mu      : (B, D) mean vector
      log_var : (B, D) log-variance diagonal (softplus-bounded positive)
    """

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
        # Shared trunk
        self.trunk = nn.Sequential(*layers)
        # Two-head output
        self.mu_head = nn.Linear(hidden_dim, embedding_dim)
        self.log_var_head = nn.Linear(hidden_dim, embedding_dim)

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
        # Initialize log_var head to output ~0 => variance ~1 at init.
        nn.init.zeros_(self.log_var_head.weight)
        nn.init.zeros_(self.log_var_head.bias)

    def forward(self, z: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
          z: (B, D) source latent

        Returns:
          mu:      (B, D) predictive mean
          log_var: (B, D) predictive log-variance
        """
        h = self.trunk(z)
        mu = self.mu_head(h)
        # softplus ensures variance > 0; log_var stays unbounded.
        log_var = F.softplus(self.log_var_head(h)).clamp(min=1e-6).log()
        return mu, log_var


def kl_diagonal_gaussian(
    mu_q: torch.Tensor,
    log_var_q: torch.Tensor,
    mu_p: torch.Tensor | None = None,
    log_var_p: torch.Tensor | None = None,
) -> torch.Tensor:
    """
    Closed-form KL divergence between two diagonal Gaussians.

    KL[N(mu_q, sigma_q) || N(mu_p, sigma_p)]
      = 0.5 * sum( log(sigma_p^2 / sigma_q^2)
                   + (sigma_q^2 + (mu_q - mu_p)^2) / sigma_p^2
                   - 1 )

    If p is omitted, defaults to N(0, I).
    """
    if mu_p is None:
        # Standard normal prior.
        return (-0.5 * (1 + log_var_q - log_var_q.exp() - mu_q.pow(2))).sum(dim=-1).mean()

    if log_var_p is None:
        log_var_p = torch.zeros_like(log_var_q)

    var_q = log_var_q.exp()
    var_p = log_var_p.exp()
    kl = 0.5 * (
        (log_var_p - log_var_q)
        + (var_q + (mu_q - mu_p).pow(2)) / var_p
        - 1
    ).sum(dim=-1).mean()
    return kl


def reconstruction_log_likelihood(
    mu_pred: torch.Tensor,
    log_var_pred: torch.Tensor,
    z_target: torch.Tensor,
) -> torch.Tensor:
    """
    E_q[log p(z_target | z_view)] under N(mu_pred, exp(log_var_pred)).

    Returns the average negative log-likelihood per sample.
    """
    var_pred = log_var_pred.exp()
    nll = 0.5 * (
        log_var_pred
        + (z_target - mu_pred).pow(2) / var_pred
        + torch.log(torch.tensor(2.0 * 3.141592653589793, device=z_target.device))
    ).sum(dim=-1).mean()
    return nll


class VJEPALoss(nn.Module):
    """
    ELBO objective for Variational JEPA.

    L_ELBO = recon_weight * E_q[log p] + kl_weight * KL[q || p]

    The recon_weight is typically 1/D (per-dimension normalization) so
    the KL term does not dominate at high embedding dimensions.
    """

    def __init__(self, config: JEPAConfig):
        super().__init__()
        self.config = config
        self.embedding_dim = config.embedding_dim
        # Per-dimension normalization prevents KL dominance.
        self.recon_weight = 1.0 / config.embedding_dim

    def forward(
        self,
        z_view: torch.Tensor,
        z_target: torch.Tensor,
        predictor: VJEPAPredictorHead,
    ) -> Tuple[torch.Tensor, dict]:
        """
        Args:
          z_view:    (B, D) source encoder output
          z_target:  (B, D) target encoder output (detached outside)
          predictor: VJEPAPredictorHead instance

        Returns:
          total_loss: scalar
          components:  dict of scalar losses for telemetry
        """
        mu_pred, log_var_pred = predictor(z_view)

        recon = reconstruction_log_likelihood(mu_pred, log_var_pred, z_target.detach())
        kl = kl_diagonal_gaussian(mu_pred, log_var_pred)

        total = self.config.vjepa_weight * (self.recon_weight * recon + self.config.kl_weight * kl)

        components = {
            "recon": float(recon.item()),
            "kl": float(kl.item()),
            "elbo": float(total.item()),
        }
        return total, components


class VJEPALocalLoss(nn.Module):
    """
    Composite VJEPA + FUR loss.

    L_total = w_jepa * L_ELBO + w_fur * L_FUR

    FUR is still applied to normalized source embeddings to preserve
    isotropy. The ELBO replaces the old deterministic MSE predictor loss.
    """

    def __init__(self, config: JEPAConfig):
        super().__init__()
        self.config = config
        self.vjepa = VJEPALoss(config)
        # Import FUR from existing module to avoid duplication.
        from losses.jepa_loss import FlexibleUniformRegularizer
        self.fur = FlexibleUniformRegularizer(
            config.embedding_dim,
            num_prior_samples=config.fur_num_prior_samples,
            bandwidth=config.fur_bandwidth,
        )

    def forward(
        self,
        z_view: torch.Tensor,
        z_target: torch.Tensor,
        predictor: nn.Module,
    ) -> Tuple[torch.Tensor, dict]:
        # Validate predictor type.
        if not isinstance(predictor, VJEPAPredictorHead):
            raise TypeError(
                "VJEPALocalLoss requires a VJEPAPredictorHead; "
                f"got {type(predictor).__name__}. "
                "Set config.use_vjepa=True to swap in the variational head."
            )

        elbo, elbo_components = self.vjepa(z_view, z_target, predictor)
        z_norm = F.normalize(z_view, dim=-1)
        l_fur = self.fur(z_norm)

        total = (
            self.config.vjepa_weight * elbo
            + self.config.fur_weight * l_fur
        )
        components = {**elbo_components, "fur": float(l_fur.item()), "total": float(total.item())}
        return total, components
