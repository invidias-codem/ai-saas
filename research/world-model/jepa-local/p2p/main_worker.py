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
        self.config = JEPAConfig()

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
        threading.Thread(target=self._start_onnx_sync_loop, name="onnx-sync", daemon=True).start()

    def export_predictor_onnx(self) -> bool:
        """
        Export the local predictor weights to ONNX format for edge inference.

        Writes to `JEPA_ONNX_PATH` or `public/wasm/predictor.onnx` by default.
        Uses a fixed dummy input shape of (1, embedding_dim) so the runtime
        can load a stable graph regardless of batch size.
        """
        try:
            self.onnx_path.parent.mkdir(parents=True, exist_ok=True)
            dummy_input = torch.randn(1, self.config.embedding_dim, dtype=torch.float32)
            torch.onnx.export(
                self.local_model.predictor,
                dummy_input,
                str(self.onnx_path),
                input_names=["z"],
                output_names=["z_pred"],
                dynamic_axes={"z": {0: "batch"}, "z_pred": {0: "batch"}},
                opset_version=18,
            )
            print(f"[MainWorker] exported predictor ONNX to {self.onnx_path}")
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
