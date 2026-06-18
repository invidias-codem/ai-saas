"""
Lattice OS Python SDK client.

Provides a Pythonic interface to the Lattice OS Partner Gateway (v1).
"""

from __future__ import annotations

import json
from typing import Iterator, Optional

import httpx
from pydantic import BaseModel


class Memory(BaseModel):
    id: str
    content: str
    type: str
    metadata: dict | None = None
    similarity: float | None = None
    created_at: str | None = None


class QueryResult(BaseModel):
    results: list[Memory]
    query: str
    total: int


class LatticeClient:
    """
    Lattice OS Partner SDK client.

    Args:
        api_key: Your partner API key (lat_live_...  or lat_test_...)
        base_url: Gateway URL (default: https://lattice.app)
        timeout: Request timeout in seconds (default: 30)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://lattice.app",
        timeout: float = 30.0,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )
        self.memory = MemoryAPI(self._client)

    def health(self) -> dict:
        """Check gateway health and verify your API key."""
        resp = self._client.get("/api/v1/health")
        resp.raise_for_status()
        return resp.json()

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class MemoryAPI:
    """Operations on workspace memories."""

    def __init__(self, client: httpx.Client):
        self._client = client

    def write(
        self,
        content: str,
        type: str = "fact",
        metadata: dict | None = None,
    ) -> str:
        """
        Write a memory to the workspace.

        Returns the memory ID.
        """
        resp = self._client.post(
            "/api/v1/memory",
            json={"content": content, "type": type, "metadata": metadata or {}},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["id"]

    def list(self, limit: int = 20, offset: int = 0) -> list[Memory]:
        """List memories from the workspace."""
        resp = self._client.get(
            "/api/v1/memory",
            params={"limit": limit, "offset": offset},
        )
        resp.raise_for_status()
        data = resp.json()
        return [Memory(**m) for m in data["memories"]]

    def query(self, query: str, limit: int = 10, include_scores: bool = True) -> QueryResult:
        """Run a semantic query against workspace memories."""
        resp = self._client.post(
            "/api/v1/query",
            json={"query": query, "limit": limit, "include_scores": include_scores},
        )
        resp.raise_for_status()
        data = resp.json()
        return QueryResult(
            results=[Memory(**r) for r in data["results"]],
            query=data["query"],
            total=data["total"],
        )

    def stream(self, query: str, limit: int = 10) -> Iterator[Memory]:
        """Stream semantic search results as an SSE event iterator."""
        with self._client.stream(
            "POST",
            "/api/v1/stream",
            json={"query": query, "limit": limit},
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]  # strip "data: "
                if payload == "[DONE]":
                    break
                event = json.loads(payload)
                if "error" in event:
                    raise RuntimeError(event["error"])
                yield Memory(**event)
