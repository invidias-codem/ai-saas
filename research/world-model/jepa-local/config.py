"""JEPA local node configuration."""

from dataclasses import dataclass, field


@dataclass
class JEPAConfig:
    """Hyperparameters for the local JEPA objective."""

    # ── Core architecture ──────────────────────────────────────────────────────
    embedding_dim: int = 256
    hidden_dim: int = 512
    predictor_depth: int = 4
    ema_tau: float = 0.996

    # ── Loss weights ───────────────────────────────────────────────────────────
    jepa_weight: float = 1.0
    fur_weight: float = 0.1
    predictor_weight: float = 0.01

    # ── VJEPA variational head ─────────────────────────────────────────────────
    vjepa_weight: float = 1.0
    kl_weight: float = 0.01
    # If True, the predictor outputs (mu, log_var) and the ELBO replaces MSE.
    use_vjepa: bool = False

    # ── DP-SGD ─────────────────────────────────────────────────────────────────
    dp_sgd_enabled: bool = False
    dp_noise_multiplier: float = 1.1
    # Baseline clipping norm; adaptive EMA adjusts this in-place.
    dp_clip_norm: float = 1.0
    dp_momentum_eta: float = 0.1
    # Clamp adaptive clip to these bounds.
    dp_clip_min: float = 0.5
    dp_clip_max: float = 3.0

    # ── Legacy / defaults ──────────────────────────────────────────────────────
    max_grad_norm: float = 1.0
    fur_num_prior_samples: int = 256
    fur_bandwidth: float | None = None
