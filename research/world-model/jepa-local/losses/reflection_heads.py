"""
Reflection Heads for BiJEPA and H-JEPA.

BiJEPA backward predictor:
  z_past = BackwardPredictor(z_stuck)

H-JEPA hyperbolic predictor:
  z_hyper_future = HyperbolicPredictor(z_stuck, z_context)

Both heads share the same lightweight trunk architecture but are trained
with separate losses offline. They are exported to a standalone ONNX file
(`reflection_expert.onnx`) so the fast-path predictor.onnx remains small.
"""
from __future__ import annotations

from typing import Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


class BackwardPredictor(nn.Module):
    """
    BiJEPA backward head: infers an approximate past cause Z_past from
    the current stuck latent state Z_stuck.

    This implements the symmetric reverse dynamics needed for reflection.
    """

    def __init__(self, embedding_dim: int = 128, hidden_dim: int = 256, depth: int = 3):
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
        layers.append(nn.Linear(hidden_dim, embedding_dim))
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


class HyperbolicPredictor(nn.Module):
    """
    H-JEPA forward head: maps (z_stuck, z_context) onto a hyperbolic
    future trajectory in the Poincaré ball.

    Output is clamped to the unit ball to preserve manifold constraints.
    """

    def __init__(self, embedding_dim: int = 128, hidden_dim: int = 256, depth: int = 3):
        super().__init__()
        self.embedding_dim = embedding_dim
        layers = []
        dim_in = embedding_dim * 2  # [z_stuck | z_context]
        for _ in range(depth - 1):
            layers.extend([
                nn.Linear(dim_in, hidden_dim),
                nn.LayerNorm(hidden_dim),
                nn.GELU(),
            ])
            dim_in = hidden_dim
        layers.append(nn.Linear(hidden_dim, embedding_dim))
        self.net = nn.Sequential(*layers)
        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, z_stuck: torch.Tensor, z_context: torch.Tensor) -> torch.Tensor:
        x = torch.cat([z_stuck, z_context], dim=-1)
        out = self.net(x)
        # Project onto Poincaré ball: clamp to unit radius with margin.
        norm = out.norm(p=2, dim=-1, keepdim=True).clamp(min=1e-12)
        max_norm = 1.0 - 1e-6
        scale = torch.where(norm > max_norm, max_norm / norm, torch.ones_like(norm))
        return out * scale


class ReflectionHeads(nn.Module):
    """
    Container for both reflection heads. Provides a single interface for
    ONNX export while keeping the two heads conceptually independent.
    """

    def __init__(self, embedding_dim: int = 128, hidden_dim: int = 256, depth: int = 3):
        super().__init__()
        self.backward = BackwardPredictor(embedding_dim, hidden_dim, depth)
        self.hyperbolic = HyperbolicPredictor(embedding_dim, hidden_dim, depth)

    def forward(self, z_stuck: torch.Tensor, z_context: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        z_past = self.backward(z_stuck)
        z_hyper_future = self.hyperbolic(z_stuck, z_context)
        return z_past, z_hyper_future
