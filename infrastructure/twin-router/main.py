"""
twin_router/main.py — UCOL Twin Router
Sits in front of vLLM and injects Architect/Builder personas.

Endpoints:
  POST /v1/architect/chat/completions  — Karpathy-mode: plan, question, architect
  POST /v1/builder/chat/completions    — Steinberger-mode: code, test, ship
  POST /v1/debate                      — Run both twins, then synthesize
  GET  /health                         — Status + model info
"""

import os
import json
import asyncio
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from personas import ARCHITECT_SYSTEM, BUILDER_SYSTEM, DEBATE_SYSTEM

app = FastAPI(title="UCOL Twin Router")

VLLM_BASE = os.getenv("VLLM_URL", "http://localhost:8000")
MODEL_NAME = os.getenv("VLLM_MODEL", "NousResearch/Hermes-3-Llama-3.1-8B")
TWIN_TIMEOUT = float(os.getenv("TWIN_TIMEOUT", "120"))

# ── Helpers ───────────────────────────────────────────────────────────────────

def inject_system(messages: list, system_prompt: str) -> list:
    """Prepend or replace the system message with the twin's persona."""
    filtered = [m for m in messages if m.get("role") != "system"]
    return [{"role": "system", "content": system_prompt}] + filtered


async def stream_vllm(payload: dict):
    """Stream tokens from vLLM back to the caller."""
    url = f"{VLLM_BASE}/v1/chat/completions"
    async with httpx.AsyncClient(timeout=TWIN_TIMEOUT) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(status_code=resp.status_code, detail=body.decode())
            async for chunk in resp.aiter_bytes():
                yield chunk


async def call_vllm_sync(payload: dict) -> str:
    """Non-streaming call to vLLM, returns full content string."""
    non_stream_payload = {**payload, "stream": False}
    url = f"{VLLM_BASE}/v1/chat/completions"
    async with httpx.AsyncClient(timeout=TWIN_TIMEOUT) as client:
        resp = await client.post(url, json=non_stream_payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

# ── Twin Endpoints ────────────────────────────────────────────────────────────

async def twin_endpoint(request: Request, system_prompt: str, twin_name: str):
    body = await request.json()
    messages = body.get("messages", [])
    stream = body.get("stream", False)

    enriched = inject_system(messages, system_prompt)
    payload = {
        **body,
        "messages": enriched,
        "model": MODEL_NAME,
    }

    print(f"[TwinRouter] {twin_name} | stream={stream} | turns={len(messages)}")

    if stream:
        return StreamingResponse(stream_vllm(payload), media_type="text/event-stream")
    else:
        url = f"{VLLM_BASE}/v1/chat/completions"
        async with httpx.AsyncClient(timeout=TWIN_TIMEOUT) as client:
            resp = await client.post(url, json={**payload, "stream": False})
            return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.post("/v1/architect/chat/completions")
async def architect(request: Request):
    return await twin_endpoint(request, ARCHITECT_SYSTEM, "Architect")


@app.post("/v1/builder/chat/completions")
async def builder(request: Request):
    return await twin_endpoint(request, BUILDER_SYSTEM, "Builder")

# ── Debate Endpoint ───────────────────────────────────────────────────────────

@app.post("/v1/debate")
async def debate(request: Request):
    """
    Run the same prompt through both twins in parallel, then synthesize.

    Request body:
      { "prompt": "...", "context": "..." (optional) }

    Returns:
      { "architect": "...", "builder": "...", "synthesis": "..." }
    """
    body = await request.json()
    prompt = body.get("prompt", "")
    context = body.get("context", "")

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    user_message = f"{context}\n\n{prompt}".strip() if context else prompt
    base_messages = [{"role": "user", "content": user_message}]

    architect_payload = {
        "model": MODEL_NAME,
        "messages": inject_system(base_messages, ARCHITECT_SYSTEM),
        "stream": False,
        "temperature": 0.4,
    }
    builder_payload = {
        "model": MODEL_NAME,
        "messages": inject_system(base_messages, BUILDER_SYSTEM),
        "stream": False,
        "temperature": 0.3,
    }

    print(f"[TwinRouter] Debate — running both twins in parallel")
    architect_response, builder_response = await asyncio.gather(
        call_vllm_sync(architect_payload),
        call_vllm_sync(builder_payload),
    )

    # Synthesize
    synthesis_prompt = f"""The Architect says:
{architect_response}

---

The Builder says:
{builder_response}

---

Original request: {prompt}

Now synthesize."""

    synthesis_payload = {
        "model": MODEL_NAME,
        "messages": inject_system(
            [{"role": "user", "content": synthesis_prompt}],
            DEBATE_SYSTEM
        ),
        "stream": False,
        "temperature": 0.2,
    }
    synthesis = await call_vllm_sync(synthesis_payload)

    return JSONResponse({
        "architect": architect_response,
        "builder": builder_response,
        "synthesis": synthesis,
        "model": MODEL_NAME,
    })

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{VLLM_BASE}/health")
            vllm_ok = resp.status_code == 200
    except Exception:
        vllm_ok = False

    return {
        "status": "ok",
        "twins": ["architect", "builder"],
        "vllm": "ok" if vllm_ok else "unreachable",
        "model": MODEL_NAME,
        "endpoints": {
            "architect": "/v1/architect/chat/completions",
            "builder": "/v1/builder/chat/completions",
            "debate": "/v1/debate",
        }
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
