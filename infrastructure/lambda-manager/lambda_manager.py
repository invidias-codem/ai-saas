"""
Lambda Labs Smart Instance Manager
===================================
Starts the GPU instance on first request, keeps it warm for IDLE_TIMEOUT_MINUTES,
then auto-terminates. All state is stored in Supabase so it survives process restarts.

Environment variables required:
  LAMBDA_API_KEY         - Lambda Labs API key
  LAMBDA_INSTANCE_TYPE   - e.g. "gpu_1x_a100_sxm4" 
  LAMBDA_REGION_NAME     - e.g. "us-west-2"
  LAMBDA_SSH_KEY_NAME    - SSH key name registered in Lambda Labs
  SUPABASE_URL           - Supabase project URL
  SUPABASE_SERVICE_KEY   - Supabase service role key
  VLLM_PORT              - Port vLLM listens on (default: 8000)
  TWIN_ROUTER_PORT       - Port twin-router listens on (default: 8002)
  IDLE_TIMEOUT_MINUTES   - Minutes idle before shutdown (default: 15)
  STARTUP_SCRIPT_B64     - base64-encoded cloud-init script to run on boot
"""

import asyncio
import base64
import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

LAMBDA_API_BASE = "https://cloud.lambdalabs.com/api/v1"
LAMBDA_API_KEY = os.environ.get("LAMBDA_API_KEY", "")
INSTANCE_TYPE = os.environ.get("LAMBDA_INSTANCE_TYPE", "gpu_1x_a100_sxm4")
REGION_NAME = os.environ.get("LAMBDA_REGION_NAME", "us-west-2")
SSH_KEY_NAME = os.environ.get("LAMBDA_SSH_KEY_NAME", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
VLLM_PORT = int(os.environ.get("VLLM_PORT", "8000"))
TWIN_PORT = int(os.environ.get("TWIN_ROUTER_PORT", "8002"))
IDLE_TIMEOUT = int(os.environ.get("IDLE_TIMEOUT_MINUTES", "15")) * 60
POLL_INTERVAL = 30  # seconds between readiness checks
MAX_STARTUP_WAIT = 300  # 5 minutes max boot wait

# --------------------------------------------------------------------------- #
# Supabase state helpers                                                        #
# --------------------------------------------------------------------------- #

async def _sb_get(key: str) -> Optional[str]:
    if not SUPABASE_URL:
        return None
    url = f"{SUPABASE_URL}/rest/v1/lambda_state?key=eq.{key}&select=value"
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        rows = r.json()
        return rows[0]["value"] if rows else None

async def _sb_set(key: str, value: str):
    if not SUPABASE_URL:
        return
    url = f"{SUPABASE_URL}/rest/v1/lambda_state"
    async with httpx.AsyncClient() as client:
        await client.post(url, json={"key": key, "value": value}, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer": "resolution=merge-duplicates",
            "Content-Type": "application/json",
        })

async def _sb_log(event: str, detail: str = ""):
    if not SUPABASE_URL:
        return
    url = f"{SUPABASE_URL}/rest/v1/lambda_events"
    async with httpx.AsyncClient() as client:
        await client.post(url, json={"event": event, "detail": detail, "ts": time.time()}, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        })

# --------------------------------------------------------------------------- #
# Lambda Labs API                                                               #
# --------------------------------------------------------------------------- #

def _lambda_headers():
    return {
        "Authorization": f"Bearer {LAMBDA_API_KEY}",
        "Content-Type": "application/json",
    }

async def list_instances() -> list:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{LAMBDA_API_BASE}/instances", headers=_lambda_headers())
        r.raise_for_status()
        return r.json().get("data", [])

async def get_running_instance() -> Optional[dict]:
    """Return the first active instance of our type, or None."""
    instances = await list_instances()
    for inst in instances:
        if inst.get("instance_type", {}).get("name") == INSTANCE_TYPE and \
           inst.get("status") in ("active", "booting"):
            return inst
    return None

async def launch_instance(startup_script: str = "") -> dict:
    """Launch a new instance and return its data."""
    payload = {
        "region_name": REGION_NAME,
        "instance_type_name": INSTANCE_TYPE,
        "ssh_key_names": [SSH_KEY_NAME],
        "name": "jklaw-auto",
    }
    if startup_script:
        payload["user_data"] = startup_script

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{LAMBDA_API_BASE}/instance-operations/launch",
            json=payload,
            headers=_lambda_headers(),
        )
        r.raise_for_status()
        data = r.json()
        # API returns {"data": {"instance_ids": [...]}}
        instance_ids = data.get("data", {}).get("instance_ids", [])
        if not instance_ids:
            raise RuntimeError(f"Launch failed: {data}")
        logger.info(f"[LambdaManager] Launched instance: {instance_ids[0]}")
        return {"id": instance_ids[0]}

async def terminate_instance(instance_id: str):
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{LAMBDA_API_BASE}/instance-operations/terminate",
            json={"instance_ids": [instance_id]},
            headers=_lambda_headers(),
        )
        r.raise_for_status()
        logger.info(f"[LambdaManager] Terminated instance: {instance_id}")

async def get_instance_ip(instance_id: str) -> Optional[str]:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{LAMBDA_API_BASE}/instances/{instance_id}",
            headers=_lambda_headers(),
        )
        r.raise_for_status()
        data = r.json().get("data", {})
        return data.get("ip")

# --------------------------------------------------------------------------- #
# Readiness checks                                                              #
# --------------------------------------------------------------------------- #

async def wait_for_ready(ip: str) -> bool:
    """Poll until twin-router and vLLM are both responding."""
    twin_url = f"http://{ip}:{TWIN_PORT}/health"
    vllm_url = f"http://{ip}:{VLLM_PORT}/health"
    deadline = time.time() + MAX_STARTUP_WAIT

    logger.info(f"[LambdaManager] Waiting for services on {ip}...")
    async with httpx.AsyncClient(timeout=5) as client:
        while time.time() < deadline:
            try:
                t = await client.get(twin_url)
                v = await client.get(vllm_url)
                if t.status_code == 200 and v.status_code == 200:
                    logger.info(f"[LambdaManager] Instance ready at {ip}")
                    return True
            except Exception:
                pass
            await asyncio.sleep(POLL_INTERVAL)

    logger.error(f"[LambdaManager] Timeout waiting for {ip}")
    return False

async def is_alive(ip: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            r = await client.get(f"http://{ip}:{TWIN_PORT}/health")
            return r.status_code == 200
    except Exception:
        return False

# --------------------------------------------------------------------------- #
# Manager — singleton                                                           #
# --------------------------------------------------------------------------- #

class LambdaInstanceManager:
    """
    Manages a single Lambda Labs GPU instance lifecycle.
    Thread-safe for async use; call ensure_running() before proxying requests.
    """

    def __init__(self):
        self._lock = asyncio.Lock()
        self._instance_id: Optional[str] = None
        self._instance_ip: Optional[str] = None
        self._last_activity: float = 0.0
        self._watchdog_task: Optional[asyncio.Task] = None

    async def _restore_state(self):
        """On startup, check if an instance is already running (process restart safe)."""
        inst = await get_running_instance()
        if inst:
            self._instance_id = inst["id"]
            self._instance_ip = inst.get("ip")
            self._last_activity = time.time()
            logger.info(f"[LambdaManager] Restored existing instance {self._instance_id} @ {self._instance_ip}")
            self._start_watchdog()

    async def ensure_running(self) -> str:
        """
        Returns the instance IP, starting the instance if needed.
        Blocks until the instance is ready.
        """
        async with self._lock:
            self._last_activity = time.time()

            # Fast path: already have a live IP
            if self._instance_ip and await is_alive(self._instance_ip):
                return self._instance_ip

            # Check Lambda for existing instance (covers process restarts)
            inst = await get_running_instance()
            if inst:
                self._instance_id = inst["id"]
                self._instance_ip = await get_instance_ip(self._instance_id)
                if self._instance_ip and await is_alive(self._instance_ip):
                    logger.info(f"[LambdaManager] Reattached to {self._instance_id}")
                    self._start_watchdog()
                    return self._instance_ip

            # Cold start
            logger.info("[LambdaManager] No running instance — launching...")
            await _sb_log("instance_launch_start", INSTANCE_TYPE)

            startup_b64 = os.environ.get("STARTUP_SCRIPT_B64", "")
            startup_script = base64.b64decode(startup_b64).decode() if startup_b64 else ""

            launched = await launch_instance(startup_script)
            self._instance_id = launched["id"]
            await _sb_set("instance_id", self._instance_id)

            # Wait for IP to be assigned (Lambda takes ~30s)
            for _ in range(20):
                ip = await get_instance_ip(self._instance_id)
                if ip:
                    self._instance_ip = ip
                    break
                await asyncio.sleep(10)

            if not self._instance_ip:
                raise RuntimeError("Instance launched but no IP assigned after 200s")

            await _sb_set("instance_ip", self._instance_ip)
            logger.info(f"[LambdaManager] Instance IP: {self._instance_ip}, waiting for services...")

            ready = await wait_for_ready(self._instance_ip)
            if not ready:
                await self.terminate()
                raise RuntimeError("Instance failed readiness checks — terminated")

            await _sb_log("instance_ready", self._instance_ip)
            self._last_activity = time.time()
            self._start_watchdog()
            return self._instance_ip

    def touch(self):
        """Update last activity timestamp (call on every proxied request)."""
        self._last_activity = time.time()

    def _start_watchdog(self):
        if self._watchdog_task and not self._watchdog_task.done():
            return
        self._watchdog_task = asyncio.create_task(self._watchdog())

    async def _watchdog(self):
        """Terminate the instance after IDLE_TIMEOUT seconds of no activity."""
        logger.info(f"[LambdaManager] Watchdog started — idle timeout: {IDLE_TIMEOUT}s")
        while True:
            await asyncio.sleep(60)
            idle = time.time() - self._last_activity
            logger.debug(f"[LambdaManager] Idle for {idle:.0f}s / {IDLE_TIMEOUT}s")

            if idle >= IDLE_TIMEOUT:
                logger.info(f"[LambdaManager] Idle timeout reached — terminating {self._instance_id}")
                await self.terminate()
                break

            # Liveness check
            if self._instance_ip and not await is_alive(self._instance_ip):
                logger.warning(f"[LambdaManager] Instance went dark — clearing state")
                async with self._lock:
                    self._instance_id = None
                    self._instance_ip = None
                break

    async def terminate(self):
        async with self._lock:
            if self._instance_id:
                try:
                    await terminate_instance(self._instance_id)
                    await _sb_log("instance_terminated", self._instance_id)
                except Exception as e:
                    logger.error(f"[LambdaManager] Terminate error: {e}")
                finally:
                    self._instance_id = None
                    self._instance_ip = None

    @property
    def status(self) -> dict:
        idle = time.time() - self._last_activity if self._last_activity else None
        return {
            "running": self._instance_ip is not None,
            "instance_id": self._instance_id,
            "instance_ip": self._instance_ip,
            "idle_seconds": round(idle) if idle else None,
            "idle_timeout_seconds": IDLE_TIMEOUT,
        }


# Global singleton
manager = LambdaInstanceManager()
