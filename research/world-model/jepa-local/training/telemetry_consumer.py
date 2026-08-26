"""
research/world-model/jepa-local/training/telemetry_consumer.py

Offline telemetry consumer: polls Supabase for DivergenceEvent tuples,
runs them through the local FUR-JEPA composite loss, and updates the
shared local model instance so the AEA engine can broadcast improvements.

Integration
-----------
This is intended to run inside a unified Python daemon alongside
`AsynchronousEnsembleAggregator` and `JepaP2PBridge`, sharing one
in-memory `LocalJEPANode`.
"""

from __future__ import annotations

import os
import time
from typing import List, Dict, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from supabase import create_client, Client

from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode, JEPALocalLoss
from aggregation.aea_engine import AsynchronousEnsembleAggregator


class TelemetryConsumer:
    """
    Continuous-learning flywheel for the local JEPA node.

    Polls Supabase divergence_events, converts (s_x, action, s_y) tuples
    into JEPA training pairs, and applies gradient updates to the shared
    local model. Processed events are flagged so they are not replayed.
    """

    def __init__(
        self,
        model: LocalJEPANode,
        config: JEPAConfig,
        supabase_url: str = "",
        supabase_key: str = "",
        learning_rate: float = 1e-4,
        batch_size: int = 32,
        max_grad_norm: float = 1.0,
        table_name: str = "divergence_events",
    ) -> None:
        self.model = model
        self.config = config
        self.batch_size = batch_size
        self.max_grad_norm = max_grad_norm
        self.table_name = table_name
        self.enabled = False

        self.optimizer = optim.AdamW(model.parameters(), lr=learning_rate)
        self.loss_fn = JEPALocalLoss(config)

        if not supabase_url or not supabase_key:
            print("[Telemetry] disabled: Supabase URL/key missing.")
            self.supabase: Client | None = None  # type: ignore[assignment]
            return
        self.supabase: Client | None = create_client(supabase_url, supabase_key)
        self.enabled = True

    def fetch_unprocessed_events(self) -> List[Dict]:
        if not self.enabled or self.supabase is None:
            return []
        response = (
            self.supabase.table("jepa_divergence_events")
            .select("*")
            .eq("processed", False)
            .order("created_at")
            .limit(self.batch_size)
            .execute()
        )
        return response.data or []

    def mark_events_processed(self, event_ids: List[str]) -> None:
        if not event_ids:
            return
        if self.supabase is None:
            return
        self.supabase.table(self.table_name) \
            .update({"processed": True}) \
            .in_("id", event_ids) \
            .execute()

    @staticmethod
    def _decode_tensor(payload: Optional[object], fallback_dim: int = 256) -> torch.Tensor:
        """
        Decode a JSON-serialized tensor payload into a float32 tensor.

        Expected shape:
          {"shape": [D], "data": [float, ...]}
        Falls back to a zero vector on missing/invalid payloads so a single
        corrupted telemetry row does not crash the batch.
        """
        if isinstance(payload, dict):
            shape = payload.get("shape") or [fallback_dim]
            data = payload.get("data") or []
            try:
                return torch.tensor(data, dtype=torch.float32).reshape(shape)
            except Exception:
                pass
        return torch.zeros(fallback_dim, dtype=torch.float32)

    def process_batch(self) -> int:
        events = self.fetch_unprocessed_events()
        if not events:
            return 0

        s_x_list: List[torch.Tensor] = []
        action_list: List[torch.Tensor] = []
        s_y_list: List[torch.Tensor] = []
        event_ids: List[str] = []

        for event in events:
            try:
                event_id = event.get("id")
                detail = event.get("detail") or {}

                s_x = self._decode_tensor(detail.get("s_x"), self.config.embedding_dim)
                action = self._decode_tensor(detail.get("action"), self.config.embedding_dim)
                s_y = self._decode_tensor(detail.get("s_y"), self.config.embedding_dim)

                # Ensure consistent embedding dims by projecting or truncating.
                def project(t: torch.Tensor, dim: int) -> torch.Tensor:
                    if t.shape[-1] == dim:
                        return t
                    if t.shape[-1] > dim:
                        return t[..., :dim]
                    # pad if smaller
                    pad = dim - t.shape[-1]
                    return F.pad(t, (0, pad))

                s_x = project(s_x, self.config.embedding_dim)
                action = project(action, self.config.embedding_dim)
                s_y = project(s_y, self.config.embedding_dim)

                s_x_list.append(s_x)
                action_list.append(action)
                s_y_list.append(s_y)
                event_ids.append(str(event_id))
            except Exception as exc:
                print(f"[Telemetry] failed to parse event {event.get('id')}: {exc}")

        if not s_x_list:
            return 0

        batch_s_x = torch.stack(s_x_list)
        batch_action = torch.stack(action_list)
        batch_s_y = torch.stack(s_y_list)

        self.model.train()
        self.optimizer.zero_grad()

        # JEPA expects two views; treat s_x as source, s_y as target.
        total_loss, components = self.model(batch_s_x, batch_s_y)
        total_loss.backward()
        nn.utils.clip_grad_norm_(self.model.parameters(), self.max_grad_norm)
        self.optimizer.step()

        # Keep target encoder synchronized after gradient update.
        self.model.update_target_encoder()

        self.mark_events_processed(event_ids)

        print(
            f"[Telemetry] processed={len(event_ids)} "
            f"loss={total_loss.item():.4f} "
            f"components={components}"
        )
        return len(event_ids)

    def run_forever(self, interval_seconds: int = 60) -> None:
        """
        Background loop intended to run inside a unified daemon thread.
        """
        print("[Telemetry] consumer started")
        while True:
            try:
                processed = self.process_batch()
                if processed == 0:
                    time.sleep(interval_seconds)
            except Exception as exc:
                print(f"[Telemetry] error: {exc}")
                time.sleep(interval_seconds)
