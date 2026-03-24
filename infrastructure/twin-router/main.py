"""
twin_router/main.py — UCOL Twin Router
Sits in front of vLLM and injects Architect/Builder/JKlaw personas.

OpenAI-compat endpoints (for Vercel / direct API calls):
  POST /v1/architect/chat/completions  — Karpathy-mode: plan, question, architect
  POST /v1/builder/chat/completions    — Steinberger-mode: code, test, ship
  POST /v1/jklaw/chat/completions      — JKlaw: orchestration, research, strategy
  POST /v1/debate                      — Run all twins, then synthesize
  GET  /health                         — Status + model info

Ollama-compat endpoints (for OpenClaw routing via SSH tunnel):
  GET  /api/tags                       — List available "models" (personas)
  POST /api/chat                       — Ollama chat format, routes by model name
  POST /api/generate                   — Ollama generate format, routes by model name

Model name → persona routing:
  jklaw / jklaw:latest                 → JKlaw (orchestration/strategy)
  architect / hermes3:architect        → Architect (first-principles planner)
  builder / hermes3:builder            → Builder (code/ship)
  hermes3:8b / default / *             → pass-through (no persona injection)
"""

import os
import json
import asyncio
import time
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from personas import ARCHITECT_SYSTEM, BUILDER_SYSTEM, DEBATE_SYSTEM, JKLAW_SYSTEM

app = FastAPI(title="UCOL Twin Router")

VLLM_BASE = os.getenv("VLLM_URL", "http://localhost:8000")
MODEL_NAME = os.getenv("VLLM_MODEL", "NousResearch/Hermes-3-Llama-3.1-8B")
TWIN_TIMEOUT = float(os.getenv("TWIN_TIMEOUT", "120"))

# ── Helpers ───────────────────────────────────────────────────────────────────

def inject_system(messages: list, system_prompt: str) -> list:
    """Prepend or replace the system message with the twin's persona."""
    filtered = [m for m in messages if m.get("role") != "system"]
    return [{"role": "system", "content": system_prompt}] + filtered


def sanitize_messages(messages: list) -> list:
    """
    Sanitize messages for vLLM compatibility.

    vLLM requires tool_calls to have:
      - id: string (required)
      - type: "function" (required)
      - function.arguments: JSON string (not dict)

    OpenClaw/Hermes may send arguments as a dict and omit id/type.
    This normalizes them before forwarding to vLLM.
    """
    sanitized = []
    for i, msg in enumerate(messages):
        msg = dict(msg)
        tool_calls = msg.get("tool_calls")
        if tool_calls:
            fixed = []
            for j, tc in enumerate(tool_calls):
                tc = dict(tc)
                # Ensure required fields
                if "id" not in tc:
                    tc["id"] = f"call_{i}_{j}"
                if "type" not in tc:
                    tc["type"] = "function"
                # Ensure function.arguments is a JSON string, not a dict
                fn = dict(tc.get("function", {}))
                args = fn.get("arguments", {})
                if isinstance(args, dict):
                    fn["arguments"] = json.dumps(args)
                elif args is None:
                    fn["arguments"] = "{}"
                tc["function"] = fn
                fixed.append(tc)
            msg["tool_calls"] = fixed
        sanitized.append(msg)
    return sanitized


async def stream_vllm(payload: dict):
    """Stream tokens from vLLM back to the caller."""
    url = f"{VLLM_BASE}/v1/chat/completions"
    payload = {**payload, "messages": sanitize_messages(payload.get("messages", []))}
    async with httpx.AsyncClient(timeout=TWIN_TIMEOUT) as client:
        async with client.stream("POST", url, json=payload) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(status_code=resp.status_code, detail=body.decode())
            async for chunk in resp.aiter_bytes():
                yield chunk


async def call_vllm_sync(payload: dict) -> str:
    """Non-streaming call to vLLM, returns full content string."""
    non_stream_payload = {
        **payload,
        "stream": False,
        "messages": sanitize_messages(payload.get("messages", [])),
    }
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


@app.post("/v1/jklaw/chat/completions")
async def jklaw(request: Request):
    return await twin_endpoint(request, JKLAW_SYSTEM, "JKlaw")


# ── Ollama-Compatible Endpoints (for OpenClaw routing) ────────────────────────

PERSONA_MAP = {
    "jklaw": JKLAW_SYSTEM,
    "jklaw:latest": JKLAW_SYSTEM,
    "hermes3:architect": ARCHITECT_SYSTEM,
    "architect": ARCHITECT_SYSTEM,
    "hermes3:builder": BUILDER_SYSTEM,
    "builder": BUILDER_SYSTEM,
}

AVAILABLE_MODELS = [
    {"name": "jklaw:latest", "model": "jklaw:latest", "modified_at": "2026-03-23T00:00:00Z", "size": 0,
     "details": {"family": "ucol-twin", "parameter_size": "8B", "quantization_level": "none"}},
    {"name": "hermes3:architect", "model": "hermes3:architect", "modified_at": "2026-03-23T00:00:00Z", "size": 0,
     "details": {"family": "ucol-twin", "parameter_size": "8B", "quantization_level": "none"}},
    {"name": "hermes3:builder", "model": "hermes3:builder", "modified_at": "2026-03-23T00:00:00Z", "size": 0,
     "details": {"family": "ucol-twin", "parameter_size": "8B", "quantization_level": "none"}},
    {"name": "hermes3:8b", "model": "hermes3:8b", "modified_at": "2026-03-23T00:00:00Z", "size": 0,
     "details": {"family": "hermes", "parameter_size": "8B", "quantization_level": "none"}},
]


@app.get("/api/tags")
async def ollama_tags():
    """Ollama /api/tags — lists available models/personas."""
    return JSONResponse({"models": AVAILABLE_MODELS})


@app.post("/api/chat")
async def ollama_chat(request: Request):
    """
    Ollama /api/chat format adapter.
    Translates Ollama request → OpenAI format → vLLM → Ollama response.
    """
    body = await request.json()
    model_name = body.get("model", "hermes3:8b").lower()
    messages = body.get("messages", [])
    stream = body.get("stream", True)
    options = body.get("options", {})

    system_prompt = PERSONA_MAP.get(model_name)
    if system_prompt:
        messages = inject_system(messages, system_prompt)
        print(f"[TwinRouter/Ollama] {model_name} → persona injected | stream={stream}")
    else:
        print(f"[TwinRouter/Ollama] {model_name} → pass-through")

    oai_payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": stream,
        "temperature": options.get("temperature", 0.7),
        "max_tokens": options.get("num_predict", 2048),
    }

    if stream:
        async def ollama_stream():
            url = f"{VLLM_BASE}/v1/chat/completions"
            async with httpx.AsyncClient(timeout=TWIN_TIMEOUT) as client:
                async with client.stream("POST", url, json=oai_payload) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            # Send final Ollama done message
                            done_msg = json.dumps({
                                "model": model_name,
                                "created_at": "",
                                "message": {"role": "assistant", "content": ""},
                                "done": True,
                                "done_reason": "stop",
                            })
                            yield done_msg + "\n"
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0]["delta"]
                            content = delta.get("content", "")
                            ollama_chunk = json.dumps({
                                "model": model_name,
                                "created_at": "",
                                "message": {"role": "assistant", "content": content},
                                "done": False,
                            })
                            yield ollama_chunk + "\n"
                        except Exception:
                            continue

        return StreamingResponse(ollama_stream(), media_type="application/x-ndjson")
    else:
        content = await call_vllm_sync(oai_payload)
        return JSONResponse({
            "model": model_name,
            "created_at": "",
            "message": {"role": "assistant", "content": content},
            "done": True,
            "done_reason": "stop",
        })


@app.post("/api/generate")
async def ollama_generate(request: Request):
    """Ollama /api/generate → translate to /api/chat format."""
    body = await request.json()
    model_name = body.get("model", "hermes3:8b")
    prompt = body.get("prompt", "")
    system = body.get("system", "")
    stream = body.get("stream", True)

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    chat_body = {"model": model_name, "messages": messages, "stream": stream}

    class FakeRequest:
        async def json(self): return chat_body

    return await ollama_chat(FakeRequest())

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
