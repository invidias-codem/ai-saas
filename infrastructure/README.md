# Vast.ai GPU Infrastructure

Self-hosted UCOL backend running on Vast.ai (4x RTX 2080 Ti / Docker Model Runner).

## Services

| Container | Port | Purpose |
|---|---|---|
| `genie-llm` | 8000 | vLLM — NousResearch/Hermes-3-Llama-3.1-8B (GPU) |
| `genie-twins` | 8002 | UCOL Twin Router — Architect + Builder personas |
| `genie-embeddings` | 8001 | BGE-base embedding server (CPU, 768-dim) |
| `genie-vector-brain` | 8080 | Python brain / Bluesky agent |
| `genie-tunnel` | — | Cloudflare tunnel (exposes services to Vercel) |

## UCOL Twin Router

The Twin Router (`genie-twins`) sits in front of vLLM and injects specialist personas.

### Endpoints

```
POST /v1/architect/chat/completions   — Karpathy-mode: plan, question, architect first
POST /v1/builder/chat/completions     — Steinberger-mode: code, test, ship fast
POST /v1/debate                       — Run both twins in parallel, synthesize verdict
GET  /health                          — Status check
```

### Debate API

```json
POST /v1/debate
{
  "prompt": "Should we add Redis between Vercel and Supabase?",
  "context": "Tech Genie, 200 users, 3-5 Supabase hits per turn"
}
```

Returns:
```json
{
  "architect": "...",   // First-principles analysis
  "builder": "...",     // Implementation-focused take
  "synthesis": "...",   // Unified verdict + action items
  "model": "NousResearch/Hermes-3-Llama-3.1-8B"
}
```

### Vercel Integration

Set these env vars in Vercel:
- `LAMBDA_TWIN_URL` — Cloudflare tunnel URL for the twin router (port 8002)
- `LAMBDA_EMBED_URL` — Cloudflare tunnel URL for embeddings (port 8001)
- `LAMBDA_OLLAMA_URL` — Legacy (kept for BlueskyResponder fallback)

## Deploy

```bash
ssh ubuntu@129.146.160.67
cd ~
sudo docker compose -f docker-compose.lambda.yml up -d
```

## GPU Notes

- A100 SXM4 40GB
- Hermes-3-8B uses ~15GB weights + KV cache at 0.82 utilization = ~33GB
- ~7GB free for future models or larger context windows
- Embedding server runs on CPU (sentence-transformers, ~500MB RAM)
- Twin router runs on CPU (pure proxy, ~50MB RAM)
