"""
GossipTransportEngine: abstract libp2p transport wrapper for P2P JEPA.

Wraps py-libp2p + Gossipsub to handle raw-byte peer gossip, deserializes
payloads safely, and feeds them into the AEA engine's non-blocking buffer.

Security
--------
- Uses torch.load(..., weights_only=True) to block pickle-based code execution.
- Production path should swap serialization to safetensors, which structurally
  prevents injection from malicious peers.
"""

from __future__ import annotations

import asyncio
import io
import time
from typing import Any, Dict, Optional

import torch

from aggregation.aea_engine import AsynchronousEnsembleAggregator


class GossipTransportEngine:
    """
    Abstract libp2p transport wrapper that feeds the AEA Engine.

    Responsibilities
    ----------------
    1. Start a libp2p host, attach Gossipsub, subscribe to the JEPA mesh topic.
    2. Receive raw gossip bytes, deserialize, and call aea.ingest_peer_model().
    3. Periodically trigger AEA aggregation and rebroadcast the local model.

    Non-blocking invariant
    ----------------------
    - _message_handler only enqueues into the AEA buffer; it never blocks.
    - periodic_aggregation_loop runs as an independent asyncio task.
    - Local training can continue uninterrupted.
    """

    def __init__(
        self,
        aea_engine: AsynchronousEnsembleAggregator,
        host_config: Dict[str, Any],
        topic_name: str = "jepa-global-mesh",
    ):
        """
        Args:
            aea_engine: The local AEA engine instance.
            host_config: libp2p host configuration dict with keys:
                - listen_addrs: list of multiaddrs, e.g. ["/ip4/0.0.0.0/tcp/0"]
                - bootstrappers: list of bootstrapper multiaddrs
                - peer_id: optional explicit peer ID
            topic_name: Gossipsub topic for JEPA model broadcasts.
        """
        self.aea_engine = aea_engine
        self.topic_name = topic_name
        self.host_config = host_config

        self.node: Any = None
        self.pubsub: Any = None
        self._aggregation_task: Optional[asyncio.Task] = None
        self._running: bool = False

    async def start(self) -> None:
        """
        Initialize the libp2p node, connect to bootstrappers, and subscribe
        to the mesh topic.
        """
        print("Initializing P2P node...")

        # 1. Instantiate the libp2p host
        # self.node = await new_node(transport_opt=self.host_config)
        # await self.node.get_network().listen(...)

        # 2. Attach the Gossipsub router
        # self.pubsub = Pubsub(self.node, GossipSub(...))

        # 3. Subscribe to the global JEPA topic
        # await self.pubsub.subscribe(self.topic_name, self._message_handler)
        print(f"Subscribed to Gossipsub mesh topic: {self.topic_name}")

        self._running = True

    async def _message_handler(self, message: Any) -> None:
        """
        Asynchronous callback triggered whenever a peer broadcasts a model.

        Deserializes the payload and enqueues it into the AEA buffer.
        Never blocks the caller.
        """
        sender_id = getattr(message, "source_id", "unknown")
        payload_bytes = message.data

        try:
            buffer = io.BytesIO(payload_bytes)
            payload = torch.load(buffer, weights_only=True)

            peer_weights = payload.get("weights")
            metadata = payload.get("metadata")

            if peer_weights and metadata:
                self.aea_engine.ingest_peer_model(peer_weights, metadata)

        except Exception as exc:
            print(f"Failed to decode peer payload from {sender_id}: {exc}")

    async def broadcast_local_model(
        self,
        local_accuracy: float,
        dataset_size: int,
    ) -> None:
        """
        Serialize the local JEPA model and broadcast it to the mesh.

        Args:
            local_accuracy: Current local validation accuracy.
            dataset_size: Number of training samples on this node.
        """
        local_weights = self.aea_engine.local_model.state_dict()

        metadata = {
            "accuracy": local_accuracy,
            "dataset_size": dataset_size,
            "timestamp": time.time(),
        }

        payload = {
            "weights": local_weights,
            "metadata": metadata,
        }

        buffer = io.BytesIO()
        torch.save(payload, buffer)
        payload_bytes = buffer.getvalue()

        # await self.pubsub.publish(self.topic_name, payload_bytes)
        print(f"Broadcasted local model. Payload size: {len(payload_bytes) / 1024:.2f} KB")

    async def periodic_aggregation_loop(
        self,
        interval_seconds: int = 300,
        local_accuracy: float = 0.85,
        dataset_size: int = 50000,
    ) -> None:
        """
        Background task that triggers AEA execution and rebroadcasts.

        Runs until the engine is stopped. Call start_aggregation_loop() after
        start() to launch it as a managed background task.

        Args:
            interval_seconds: How often to aggregate and rebroadcast.
            local_accuracy: Simulated local accuracy (replace with real metric).
            dataset_size: Simulated local dataset size (replace with real count).
        """
        while self._running:
            await asyncio.sleep(interval_seconds)

            if not self._running:
                break

            # Execute AEA aggregation on buffered peer models
            self.aea_engine.execute_aggregation()

            # Broadcast the updated local model to the mesh
            await self.broadcast_local_model(local_accuracy, dataset_size)

    def start_aggregation_loop(
        self,
        interval_seconds: int = 300,
        local_accuracy: float = 0.85,
        dataset_size: int = 50000,
    ) -> None:
        """
        Launch the periodic aggregation loop as a background asyncio task.

        Must be called after start() from within an active event loop.
        """
        if self._aggregation_task is not None:
            raise RuntimeError("Aggregation loop is already running")

        loop = asyncio.get_event_loop()
        self._aggregation_task = loop.create_task(
            self.periodic_aggregation_loop(
                interval_seconds=interval_seconds,
                local_accuracy=local_accuracy,
                dataset_size=dataset_size,
            )
        )

    async def stop(self) -> None:
        """
        Gracefully shut down the libp2p node and cancel background tasks.
        """
        self._running = False

        if self._aggregation_task is not None:
            self._aggregation_task.cancel()
            try:
                await self._aggregation_task
            except asyncio.CancelledError:
                pass
            self._aggregation_task = None

        # if self.pubsub:
        #     await self.pubsub.unsubscribe(self.topic_name)
        # if self.node:
        #     await self.node.close()

        print("Gossip transport stopped.")
