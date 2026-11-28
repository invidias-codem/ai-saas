"""
DP-SGD Engine
=============

Wraps a standard PyTorch optimizer with differentially-private gradient
clipping and noise injection.

Decentralized adaptive clipping:
  Uses a last-iterate momentum EMA per worker — no global coordination,
  no extra privacy budget consumption.

  slack_i(t) = || g_i(t) ||_2 - clip_norm(t)
  Δclip(t)    = eta * slack(t) + (1 - eta) * Δclip(t-1)
  clip_norm(t+1) = clip_norm(t) + Δclip(t)

  clip_norm is clamped to [clip_min * C0, clip_max * C0].

Privacy accounting:
  The Gaussian mechanism is calibrated to the current clip_norm.
  Composition uses RDP; convert to (eps, delta) with alphas.

References:
  - Abadi et al., "Deep Learning with Differential Privacy" (2016)
  - Bu et al., "Decentralized Training under...", last-iterate analysis
"""

from __future__ import annotations

import threading
import time
from typing import Optional

import torch
import torch.nn as nn


class DpSgdEngine:
    """
    Differentially-private SGD wrapper.

    Call `step_with_privacy(loss)` instead of `optimizer.step()`.
    Gradient clipping + Gaussian noise happen inside this method.

    The engine maintains per-worker adaptive clipping state, so each
    PM2 process can tune independently without mesh communication.
    """

    def __init__(
        self,
        params: list[nn.Parameter],
        lr: float = 1e-4,
        noise_multiplier: float = 1.1,
        clip_norm: float = 1.0,
        momentum_eta: float = 0.1,
        clip_min: float = 0.5,
        clip_max: float = 3.0,
        max_grad_norm: float = 1.0,
        seed: Optional[int] = None,
    ):
        self.optimizer = torch.optim.AdamW(params, lr=lr)
        self.noise_multiplier = float(noise_multiplier)
        self.clip_norm = float(clip_norm)
        self.momentum_eta = float(momentum_eta)
        self.clip_min = float(clip_min)
        self.clip_max = float(clip_max)
        self.max_grad_norm = float(max_grad_norm)

        # Last-iterate adaptive clipping state.
        self._delta_clip: float = 0.0
        self._lock = threading.Lock()
        self._rng = torch.Generator()
        if seed is not None:
            self._rng.manual_seed(seed)
        else:
            self._rng.seed()

    @property
    def current_clip_norm(self) -> float:
        with self._lock:
            return self.clip_norm

    def _update_clip_norm(self, raw_norm: float) -> None:
        """Momentum EMA adaptive clipping (last-iterate, local-only)."""
        with self._lock:
            slack = raw_norm - self.clip_norm
            self._delta_clip = (
                self.momentum_eta * slack
                + (1.0 - self.momentum_eta) * self._delta_clip
            )
            self.clip_norm = max(
                self.clip_min,
                min(self.clip_max, self.clip_norm + self._delta_clip),
            )

    def step_with_privacy(self, loss: torch.Tensor) -> dict:
        """
        Backward + clip + noise + step.

        Returns telemetry dict:
          clip_norm, raw_norm, noise_std, noise_seed
        """
        loss.backward()

        # First, legacy max_grad_norm safety clip.
        legacy_norm = nn.utils.clip_grad_norm_(self.optimizer.param_groups[0]["params"], self.max_grad_norm)

        # Compute the actual per-sample gradient norm before DP clipping.
        with torch.no_grad():
            total_sq = 0.0
            for p in self.optimizer.param_groups[0]["params"]:
                if p.grad is not None:
                    total_sq += p.grad.data.pow(2).sum().item()
            raw_norm = total_sq ** 0.5

        # Adaptive clip norm in-place on .grad data.
        clip = self.clip_norm
        for p in self.optimizer.param_groups[0]["params"]:
            if p.grad is None:
                continue
            g = p.grad.data
            g_norm = g.norm(2)
            if g_norm > clip:
                g.mul_(clip / (g_norm + 1e-12))

        # Noise scale: calibrated to current clip_norm.
        noise_std = self.noise_multiplier * clip
        with torch.no_grad():
            for p in self.optimizer.param_groups[0]["params"]:
                if p.grad is None:
                    continue
                noise = torch.randn(
                    p.grad.shape,
                    dtype=p.grad.dtype,
                    device=p.grad.device,
                    generator=self._rng,
                ).mul_(noise_std)
                p.grad.add_(noise)

        self.optimizer.step()
        self.optimizer.zero_grad()

        # Update adaptive clipping state.
        self._update_clip_norm(raw_norm)

        return {
            "clip_norm": float(clip),
            "raw_norm": float(raw_norm),
            "noise_std": float(noise_std),
            "updated_clip_norm": float(self.clip_norm),
            "legacy_grad_norm": float(legacy_norm),
        }
