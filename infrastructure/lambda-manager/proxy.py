"""
Smart Proxy — sits in front of the twin router.
On every request it calls manager.ensure_running() to guarantee
the Lambda instance is live, then reverse-proxies the request.

Endpoints:
  GET  /health              → {"status": "ok", "instance": <manager.status>}
  GET  /status              → manager.status (human-readable)
  POST /admin/terminate     → force-terminate the instance now
  *    /*                   → proxy to twin-router on live instance

Deploy this on the MacBook (or any always-on host) behind Nginx/Caddy.
The Lambda instance only runs when there's actual traffic.
"""

import logging
import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from lambda_manager import manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="JKlaw Smart Proxy")
TWIN_PORT = int(os.environ.get("TWIN_ROUTER_PORT", "8002"))


@app.on_event("startup")
async def startup():
    # Restore state in case this process restarted while instance was running
    await manager._restore_state()


@app.get("/health")
async def health():
    return {"status": "ok", "instance": manager.status}


@app.get("/status")
async def status():
    s = manager.status
    return JSONResponse({
        **s,
        "idle_until_shutdown": f"{max(0, s['idle_timeout_seconds'] - (s['idle_seconds'] or 0))}s remaining" if s["running"] else "not running",
    })


@app.post("/admin/terminate")
async def admin_terminate():
    await manager.terminate()
    return {"terminated": True}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(request: Request, path: str):
    """Ensure instance is running, then proxy the request."""
    try:
        ip = await manager.ensure_running()
    except Exception as e:
        logger.error(f"[Proxy] Failed to start instance: {e}")
        return JSONResponse({"error": "Instance unavailable", "detail": str(e)}, status_code=503)

    manager.touch()

    target_url = f"http://{ip}:{TWIN_PORT}/{path}"
    if request.query_params:
        target_url += f"?{request.query_params}"

    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)

    # Detect streaming requests (Ollama stream=true)
    is_stream = b'"stream":true' in body or b'"stream": true' in body

    try:
        if is_stream:
            async def stream_gen():
                async with httpx.AsyncClient(timeout=120) as client:
                    async with client.stream(
                        request.method, target_url,
                        content=body, headers=headers
                    ) as resp:
                        async for chunk in resp.aiter_bytes():
                            manager.touch()  # keep alive while streaming
                            yield chunk

            return StreamingResponse(stream_gen(), media_type="application/x-ndjson")
        else:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.request(
                    request.method, target_url,
                    content=body, headers=headers
                )
                return JSONResponse(content=resp.json(), status_code=resp.status_code)

    except Exception as e:
        logger.error(f"[Proxy] Request to {target_url} failed: {e}")
        return JSONResponse({"error": "Proxy error", "detail": str(e)}, status_code=502)
