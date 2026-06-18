"""
Lattice OS Partner SDK
========================

memory-native AI platform integration.

Quick start:
    from lattice import LatticeClient

    client = LatticeClient(api_key="lat_live_...", base_url="https://lattice.app")

    # Write a memory
    client.memory.write("User prefers dark mode", type="preference")

    # Query workspace memories
    results = client.memory.query("What does the user prefer?")

    # Stream results (for agentic loops)
    for event in client.memory.stream("context for this conversation"):
        print(event.content, event.similarity)
"""

from lattice.client import LatticeClient

__all__ = ["LatticeClient"]
__version__ = "0.1.0"
