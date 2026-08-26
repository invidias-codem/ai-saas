"""
research/world-model/jepa-local/p2p/main_worker.py

Unified daemon owning one shared local JEPA model:
- TelemetryConsumer trains the model from Supabase DivergenceEvents
- AsynchronousEnsembleAggregator merges gossiped peer weights
- Periodic gossip broadcast announces the improved local model

This replaces the earlier separate jepa-aea PM2 app with a single
process that mutates one in-memory LocalJEPANode instance.
"""

from __future__ import annotations

import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

import torch

from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode
from aggregation.aea_engine import AsynchronousEnsembleAggregator
from training.telemetry_consumer import TelemetryConsumer


class MainWorker:
    def __init__(self) -> None:
        # Environment-driven feature flags for VJEPA/DP-SGD.
        use_vjepa = os.environ.get("USE_VJEPA", "false").lower() in ("1", "true", "yes")
        dp_sgd_enabled = os.environ.get("DP_SGD_ENABLED", "false").lower() in ("1", "true", "yes")

        self.config = JEPAConfig(
            use_vjepa=use_vjepa,
            dp_sgd_enabled=dp_sgd_enabled,
            dp_noise_multiplier=float(os.environ.get("DP_NOISE_MULTIPLIER", "1.1")),
            dp_clip_norm=float(os.environ.get("DP_CLIP_NORM", "1.0")),
            dp_momentum_eta=float(os.environ.get("DP_MOMENTUM_ETA", "0.1")),
            dp_clip_min=float(os.environ.get("DP_CLIP_MIN", "0.5")),
            dp_clip_max=float(os.environ.get("DP_CLIP_MAX", "3.0")),
        )

        root = Path(__file__).resolve().parent.parent.parent
        queue_path = root / "p2p" / "gossip_queue.jsonl"
        queue_path.parent.mkdir(parents=True, exist_ok=True)

        supabase_url = os.environ.get("SUPABASE_TELEMETRY_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

        self.local_model = LocalJEPANode(self.config)
        self.aggregator = AsynchronousEnsembleAggregator(
            local_model=self.local_model,
            config=self.config,
        )
        self.telemetry = TelemetryConsumer(
            model=self.local_model,
            config=self.config,
            supabase_url=supabase_url,
            supabase_key=supabase_key,
            batch_size=int(os.environ.get("TELEMETRY_BATCH_SIZE", "32")),
        )

        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._round_count = 0
        self.queue_path = queue_path
        self.onnx_path = Path(
            os.environ.get("JEPA_ONNX_PATH", root / "public" / "wasm" / "predictor.onnx")
        )
        # Variance spike state for GossipSub dynamic heartbeat.
        self._variance_spike = threading.Event()
        self._variance_history: list[float] = []

    def setVarianceSpike(self, spike: bool) -> None:
        """Called by the DP variance watchdog; consumed by transport layer."""
        prev = self.hasVarianceSpike()
        if spike:
            self._variance_spike.set()
        else:
            self._variance_spike.clear()
        if spike != prev:
            self._notify_variance_state(spike)

    def hasVarianceSpike(self) -> bool:
        return self._variance_spike.is_set()

    def _notify_variance_state(self, spike: bool) -> None:
        """Best-effort POST to the Next.js P2P state bridge."""
        try:
            url = os.environ.get("NEXT_PUBLIC_APP_URL", "").rstrip("/")
            if not url:
                return
            path = os.environ.get("JEPA_P2P_STATE_PATH", "/api/jepa/p2p/state")
            payload = json.dumps({"hasVarianceSpike": spike}).encode("utf-8")
            req = __import__("urllib.request").request.Request(
                f"{url}{path}",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with __import__("urllib.request").urlopen(req, timeout=2) as resp:
                if resp.status != 200:
                    print(f"[MainWorker] variance bridge HTTP {resp.status}")
        except Exception as exc:
            print(f"[MainWorker] variance bridge notify failed: {exc}")

    def drain_gossip_queue(self) -> int:
        entries: list[dict] = []
        with self._lock:
            if not self.queue_path.exists():
                return 0
            raw = self.queue_path.read_text(encoding="utf-8").splitlines()
            entries = [json.loads(line) for line in raw if line.strip()]
            self.queue_path.write_text("", encoding="utf-8")

        for payload in entries:
            try:
                weights = {}
                for key, tensor in payload.get("weights", {}).items():
                    shape = tuple(tensor.get("shape", []))
                    data = tensor.get("data", [])
                    import torch
                    weights[key] = torch.tensor(data, dtype=torch.float32).reshape(shape)
                self.aggregator.ingest_peer_model(
                    weights, payload.get("metadata", {})
                )
            except Exception as exc:
                print(f"[MainWorker] bad gossip payload: {exc}")

        return len(entries)

    def start_background_loops(self) -> None:
        gossip_seconds = float(os.environ.get("GOSSIP_DRAIN_INTERVAL_SECONDS", "30"))
        aea_seconds = float(os.environ.get("AEA_INTERVAL_SECONDS", "60"))

        def gossip_loop() -> None:
            while not self._stop.is_set():
                time.sleep(gossip_seconds)
                if self._stop.is_set():
                    break
                try:
                    ingested = self.drain_gossip_queue()
                    if ingested:
                        print(f"[MainWorker] drained {ingested} gossip payloads")
                except Exception as exc:
                    print(f"[MainWorker] gossip drain error: {exc}")

        def aea_loop() -> None:
            while not self._stop.is_set():
                time.sleep(aea_seconds)
                if self._stop.is_set():
                    break
                try:
                    report = self.aggregator.execute_aggregation()
                    self._round_count += 1
                    print(
                        f"[MainWorker] AEA round={self._round_count} report={report}"
                    )
                except Exception as exc:
                    print(f"[MainWorker] AEA round error: {exc}")

        def telemetry_loop() -> None:
            telemetry_seconds = float(
                os.environ.get("TELEMETRY_INTERVAL_SECONDS", "60")
            )
            while not self._stop.is_set():
                time.sleep(telemetry_seconds)
                if self._stop.is_set():
                    break
                try:
                    processed = self.telemetry.process_batch()
                    if processed:
                        print(f"[MainWorker] telemetry processed={processed}")
                except Exception as exc:
                    print(f"[MainWorker] telemetry error: {exc}")

        threading.Thread(target=gossip_loop, name="gossip-drain", daemon=True).start()
        threading.Thread(target=aea_loop, name="aea-loop", daemon=True).start()
        threading.Thread(
            target=telemetry_loop, name="telemetry-loop", daemon=True
        ).start()
        threading.Thread(
            target=self._start_dp_variance_watchdog, name="dp-variance-watchdog", daemon=True
        ).start()
        threading.Thread(target=self._start_onnx_sync_loop, name="onnx-sync", daemon=True).start()

    def _start_dp_variance_watchdog(self) -> None:
        """
        Monitor rolling variance of DP-SGD gradient norms.

        When variance spikes above a threshold, setVarianceSpike(True) to
        trigger dynamic heartbeat shrinkage in the GossipSub mesh.
        """
        interval_seconds = float(os.environ.get("DP_VARIANCE_WATCHDOG_INTERVAL_SECONDS", "30"))
        window = int(os.environ.get("DP_VARIANCE_WATCHDOG_WINDOW", "10"))
        threshold = float(os.environ.get("DP_VARIANCE_SPIKE_THRESHOLD", "2.0"))
        print(
            f"[MainWorker] DP variance watchdog started; interval={interval_seconds}s "
            f"window={window} threshold={threshold}"
        )
        while not self._stop.is_set():
            time.sleep(interval_seconds)
            if self._stop.is_set():
                break
            try:
                if not self.config.dp_sgd_enabled or not self.dp_engine:
                    continue
                clip = getattr(self.dp_engine, "current_clip_norm", None)
                if clip is None:
                    continue
                # Use rolling history of DP clip_norm updates as a proxy for gradient variance.
                self._variance_history.append(clip)
                if len(self._variance_history) > window:
                    self._variance_history.pop(0)
                if len(self._variance_history) < 3:
                    continue
                mean = sum(self._variance_history) / len(self._variance_history)
                var = sum((x - mean) ** 2 for x in self._variance_history) / len(self._variance_history)
                spike = var > threshold
                prev = self.hasVarianceSpike()
                self.setVarianceSpike(spike)
                if spike != prev:
                    print(
                        f"[MainWorker] DP variance watchdog: var={var:.4f} "
                        f"spike={spike} clip={clip:.4f}"
                    )
            except Exception as exc:
                print(f"[MainWorker] DP variance watchdog error: {exc}")

    def export_predictor_onnx(self) -> bool:
        """
        Export the local predictor weights to ONNX format for edge inference.

        Writes to `JEPA_ONNX_PATH` or `public/wasm/predictor.onnx` by default.

        VJEPA mode:
          Exports the VJEPAPredictorHead with dual outputs
          `mu` and `log_var`, both shaped (batch, embedding_dim).

        Deterministic mode:
          Exports the standard JEPAPredictor with single output `z_pred`.
        """
        try:
            self.onnx_path.parent.mkdir(parents=True, exist_ok=True)

            if self.local_model.vjepa_mode:
                # Dual-output VJEPA export.
                from losses.vjepa_loss import VJEPAPredictorHead
                predictor = self.local_model.predictor
                input_names = ["z"]
                output_names = ["mu", "log_var"]
            else:
                predictor = self.local_model.predictor
                input_names = ["z"]
                output_names = ["z_pred"]

            dummy_input = torch.randn(1, self.config.embedding_dim, dtype=torch.float32)
            torch.onnx.export(
                predictor,
                dummy_input,
                str(self.onnx_path),
                input_names=input_names,
                output_names=output_names,
                dynamic_axes={name: {0: "batch"} for name in input_names + output_names},
                opset_version=17,
            )
            print(
                f"[MainWorker] exported {'VJEPA ' if self.local_model.vjepa_mode else ''}predictor "
                f"ONNX to {self.onnx_path} outputs={output_names}"
            )
            return True
        except Exception as exc:
            print(f"[MainWorker] ONNX export failed: {exc}")
            return False

    def _start_onnx_sync_loop(self) -> None:
        interval = float(os.environ.get("ONNX_SYNC_INTERVAL_SECONDS", "300"))
        print(f"[MainWorker] ONNX sync loop started; interval={interval}s")
        while not self._stop.is_set():
            time.sleep(interval)
            if self._stop.is_set():
                break
            try:
                self.export_predictor_onnx()
            except Exception as exc:
                print(f"[MainWorker] ONNX sync loop error: {exc}")

    def run_forever(self) -> int:
        self.start_background_loops()
        print("[MainWorker] started")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            self.stop()
        return 0

    def stop(self) -> None:
        self._stop.set()


def main() -> int:
    load_dotenv(dotenv_path=".env.local", override=True)
    worker = MainWorker()

    def handle_signal(signum: int, _frame: object) -> None:
        print(f"[MainWorker] signal {signum}; stopping")
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    return worker.run_forever()


if __name__ == "__main__":
    raise SystemExit(main())
