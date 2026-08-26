"""JEPA local node configuration."""

from dataclasses import dataclass


@dataclass
class JEPAConfig:
    """Hyperparameters for the local JEPA objective."""

    embedding_dim: int = 256
    hidden_dim: int = 512
    predictor_depth: int = 4
    ema_tau: float = 0.996
    jepa_weight: float = 1.0
    fur_weight: float = 0.1
    predictor_weight: float = 0.01
    max_grad_norm: float = 1.0
    fur_num_prior_samples: int = 256
    fur_bandwidth: float | None = None
