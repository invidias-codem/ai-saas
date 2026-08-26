"""
research/world-model/jepa-local/p2p/aea_trigger.py

Thin bridge between the standalone Node worker and the local AEA engine.

Design
------
- Keeps all torch operations in-process.
- Exposes a minimal HTTP trigger the Node worker can call.
- Reads the local JSONL queue written by the bridge.
- Calls `execute_aggregation()` on a configured interval or when notified.
"""

from __future__ import annotations

import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Optional

from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode
from aggregation.aea_engine import AsynchronousEnsembleAggregator


class AEATrigger:
    """
    Owns the local JEPA model + AEA engine.
    Consumes peer updates from a local JSONL queue.
    """

    def __init__(self, config: JEPAConfig, queue_path: Path) -> None:
        self.config = config
        self.queue_path = queue_path
        self.local_model = LocalJEPANode(config)
        self.aggregator = AsynchronousEnsembleAggregator(
            local_model=self.local_model,
            config=config,
        )
        self._lock = threading.Lock()
        self._stop = threading.Event()

    def enqueue_payload(self, payload: Dict) -> None:
        """
        Append a gossip payload to the JSONL queue.
        """
        line = json.dumps(payload, separators=(",", ":"))
        with self._lock:
            with self.queue_path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")

    def drain_queue(self) -> int:
        """
        Replay queued payloads into the AEA buffer and truncate the file.
        """
        entries: list[Dict] = []
        with self._lock:
            if not self.queue_path.exists():
                return 0
            raw = self.queue_path.read_text(encoding="utf-8").splitlines()
            entries = [json.loads(line) for line in raw if line.strip()]
            self.queue_path.write_text("", encoding="utf-8")

        for payload in entries:
            weights = {}
            for key, tensor in payload.get("weights", {}).items():
                import torch
                shape = tuple(tensor.get("shape", []))
                data = tensor.get("data", [])
                weights[key] = torch.tensor(data, dtype=torch.float32).reshape(shape)
            metadata = payload.get("metadata", {})
            self.aggregator.ingest_peer_model(weights, metadata)

        return len(entries)

    def run_aggregation_round(self) -> Dict[str, float]:
        report = self.aggregator.execute_aggregation()
        return report

    def start_periodic(self, interval_seconds: float = 60.0) -> None:
        """
        Background thread that drains the queue and runs aggregation
        every `interval_seconds` seconds until stopped.
        """
        def loop() -> None:
            while not self._stop.is_set():
                time.sleep(interval_seconds)
                if self._stop.is_set():
                    break
                try:
                    ingested = self.drain_queue()
                    if ingested:
                        report = self.run_aggregation_round()
                        print(f"[AEA] aggregation round: {report}")
                except Exception as exc:
                    print(f"[AEA] round failed: {exc}")

        t = threading.Thread(target=loop, name="aea-trigger", daemon=True)
        t.start()

    def stop(self) -> None:
        self._stop.set()


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    queue_path = root / "p2p" / "gossip_queue.jsonl"
    config = JEPAConfig()

    trigger = AEATrigger(config=config, queue_path=queue_path)

    def handle_signal(signum: int, _frame: object) -> None:
        print(f"[AEA] signal {signum}; stopping")
        trigger.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    trigger.start_periodic(interval_seconds=60.0)
    print(f"[AEA] started; queue={queue_path}")

    # Keep main thread alive.
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        trigger.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
