"""
research/world-model/jepa-local/p2p/validation/synthetic_injector.py

Injects synthetic divergence events into a target node's Supabase table
to bootstrap multi-node mesh validation.

Design
------
- Generates N synthetic (s_x, action, s_y) tuples with controlled divergence.
- Inserts them into divergence_events with processed=False.
- The target node's TelemetryConsumer will pick these up on its next poll.
"""

from __future__ import annotations

import os
import random
import sys
from typing import List

import torch
from supabase import create_client, Client


def generate_synthetic_batch(
    batch_size: int,
    embedding_dim: int,
    divergence_scale: float = 5.0,
) -> List[dict]:
    """
    Generate synthetic divergence events with a known divergence signature.

    Args:
        batch_size: Number of events to generate.
        embedding_dim: Dimensionality of the latent space.
        divergence_scale: Multiplier applied to s_y to create a detectable
            divergence from the source distribution. Larger values produce
            more divergent weights that should be rejected by the AEA engine.

    Returns:
        List of Supabase-ready row dicts.
    """
    rows: List[dict] = []
    base = torch.randn(embedding_dim)
    action = torch.randn(embedding_dim)

    for _ in range(batch_size):
        # s_x is drawn from the base distribution.
        s_x = (base + torch.randn(embedding_dim) * 0.1).tolist()
        # s_y is deliberately shifted to create high divergence.
        s_y = (base + torch.randn(embedding_dim) * divergence_scale).tolist()
        rows.append({
            "s_x": {"shape": [embedding_dim], "data": s_x},
            "action": {"shape": [embedding_dim], "data": action.tolist()},
            "s_y": {"shape": [embedding_dim], "data": s_y},
            "processed": False,
            "detail": {
                "s_x": {"shape": [embedding_dim], "data": s_x},
                "action": {"shape": [embedding_dim], "data": action.tolist()},
                "s_y": {"shape": [embedding_dim], "data": s_y},
            },
        })
    return rows


def inject_events(
    supabase_url: str,
    supabase_key: str,
    table_name: str,
    rows: List[dict],
) -> int:
    client: Client = create_client(supabase_url, supabase_key)
    response = client.table(table_name).insert(rows).execute()
    return len(response.data or [])


def main() -> int:
    url = os.environ.get("SUPABASE_TELEMETRY_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("[Injector] SUPABASE_TELEMETRY_URL and SUPABASE_SERVICE_ROLE_KEY required")
        return 1

    table = os.environ.get("TELEMETRY_TABLE", "divergence_events")
    batch_size = int(os.environ.get("INJECT_BATCH_SIZE", "16"))
    embedding_dim = int(os.environ.get("JEPA_EMBEDDING_DIM", "256"))
    divergence_scale = float(os.environ.get("INJECT_DIVERGENCE_SCALE", "5.0"))

    print(
        f"[Injector] injecting {batch_size} synthetic events "
        f"dim={embedding_dim} scale={divergence_scale}"
    )
    rows = generate_synthetic_batch(batch_size, embedding_dim, divergence_scale)
    inserted = inject_events(url, key, table, rows)
    print(f"[Injector] inserted {inserted} events into {table}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
