# Lattice OS Python SDK

```bash
pip install lattice-sdk
```

## Quick Start

```python
from lattice import LatticeClient

# Initialize with your partner API key
client = LatticeClient(api_key="lat_live_...")

# Write a memory
client.memory.write("User prefers Python over JavaScript", type="preference")

# Query workspace memories
result = client.memory.query("What programming language does the user prefer?")
for m in result.results:
    print(f"  {m.content} (similarity: {m.similarity})")

# Stream results (ideal for agent loops)
for event in client.memory.stream("recent context"):
    print(event.content)
```

## Endpoints

| Client Method | Gateway Endpoint | Scope Required |
|---|---|---|
| `client.health()` | `GET /api/v1/health` | Any |
| `client.memory.write(...)` | `POST /api/v1/memory` | `memory:write` |
| `client.memory.list(...)` | `GET /api/v1/memory` | `memory:read` |
| `client.memory.query(...)` | `POST /api/v1/query` | `query:read` |
| `client.memory.stream(...)` | `POST /api/v1/stream` | `stream:read` |

## Configuration

```python
client = LatticeClient(
    api_key="lat_live_...",           # Required
    base_url="https://lattice.app",   # Your gateway URL
    timeout=30.0,                     # Request timeout (seconds)
)
```

## Context Manager

```python
with LatticeClient(api_key="...") as client:
    results = client.memory.query("search term")
# Connection is automatically closed
```
