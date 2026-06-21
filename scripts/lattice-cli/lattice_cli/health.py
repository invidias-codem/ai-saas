"""
Health checks and preflight verification for lattice-cli.

Validates that a Lattice OS deployment is functional:
  - Docker daemon reachable
  - Compose project running
  - /api/preflight returns healthy JSON
  - Required env vars set
  - License active and unexpired
"""

import json
import sys
import time
from urllib.request import urlopen
from urllib.error import URLError

from .config import load_config, deployment_state, save_deployment_state, ts
from . import docker_ops
from . import license as lic


def _http_get(url: str, timeout: int = 10) -> dict | None:
    """Make a GET request and return parsed JSON, or None on failure."""
    try:
        with urlopen(url, timeout=timeout) as resp:
            data = json.loads(resp.read())
            return data
    except (URLError, OSError, json.JSONDecodeError) as e:
        return None


def cmd_check(args):
    """Run a full health check on the deployed Lattice OS instance."""
    config = load_config()
    instance = args.instance or "default"
    state = deployment_state(instance)

    print(f"\n  Lattice OS Health Check — {instance}")
    print(f"  {'─' * 50}")

    checks = []

    # 1. Docker daemon
    print(f"\n  [1/5] Docker daemon ...", end=" ", flush=True)
    if docker_ops.check_docker():
        print("✓")
        checks.append(True)
    else:
        print("✗")
        checks.append(False)

    # 2. Compose project running
    print(f"  [2/5] Compose services ...", end=" ", flush=True)
    compose_file = config.get("compose_file", "docker-compose.yml")
    project_name = config.get("project_name", "lattice")
    services = docker_ops.compose_ps(compose_file, project_name)
    if services:
        running = [s.get("Name", "?") for s in services if s.get("State") == "running"]
        print(f"✓ ({len(running)} running)")
        checks.append(True)
    else:
        print("✗ No services found")
        checks.append(False)

    # 3. Preflight endpoint
    print(f"  [3/5] Preflight endpoint ...", end=" ", flush=True)
    port = args.port or 3000
    secret = args.secret or ""
    url = f"http://localhost:{port}/api/preflight"
    if secret:
        url += f"?secret={secret}"

    data = _http_get(url)
    if data:
        is_healthy = all([
            data.get("db_configured", False),
            data.get("auth_configured", False),
            data.get("ai_configured", False),
            data.get("db_reachable", False),
        ])
        mode = "Mode A" if data.get("mode_a_active") else "Vercel/Dev"
        if is_healthy:
            print(f"✓ ({mode})")
            checks.append(True)
        else:
            print(f"⚠ Partial — some services not configured")
            print(f"        DB:        {'✓' if data.get('db_configured') else '✗'}")
            print(f"        Auth:      {'✓' if data.get('auth_configured') else '✗'}")
            print(f"        AI:        {'✓' if data.get('ai_configured') else '✗'}")
            print(f"        DB Reachable: {'✓' if data.get('db_reachable') else '✗'}")
            checks.append(False)
    else:
        print("✗ Not reachable")
        checks.append(False)

    # 4. License status
    print(f"  [4/5] License ...", end=" ", flush=True)
    license_data = lic.get_active_license()
    if license_data and license_data.get("status") == "active":
        tier = license_data.get("tier", "unknown")
        expires = license_data.get("expires_at", "?")
        print(f"✓ ({tier}, expires {expires[:10]})")
        checks.append(True)
    elif license_data and license_data.get("status") == "expired":
        print(f"✗ Expired")
        checks.append(False)
    else:
        print("⚠ No license (community mode)")
        checks.append(True)  # Not a hard failure

    # 5. Network isolation (if air-gapped mode)
    deployment_mode = config.get("deployment_mode", "standard")
    print(f"  [5/5] Network mode ...", end=" ", flush=True)
    if deployment_mode == "air-gapped":
        print("Air-gapped (no outbound internet required)")
    else:
        print("Standard (outbound internet expected)")
    checks.append(True)

    # Summary
    all_ok = all(checks)
    print(f"\n  {'─' * 50}")
    if all_ok:
        print(f"  ✓ All checks passed")
    else:
        failed = checks.count(False)
        print(f"  ✗ {failed} check(s) failed — review above")
    print()

    # Update deployment state
    state["last_health_check"] = ts()
    state["health_ok"] = all_ok
    save_deployment_state(instance, state)

    return 0 if all_ok else 1


def cmd_logs(args):
    """Stream or tail compose logs."""
    config = load_config()
    compose_file = config.get("compose_file", "docker-compose.yml")
    project_name = config.get("project_name", "lattice")
    service = args.service if hasattr(args, "service") else None
    tail = args.tail if hasattr(args, "tail") else 50
    follow = args.follow if hasattr(args, "follow") else False

    print(f"  Streaming logs for {project_name} ...")
    docker_ops.compose_logs(compose_file, project_name, service, tail, follow)
    return 0


def get_subcommands():
    return {
        "check": {
            "help": "Run full health check on the deployed instance",
            "handler": cmd_check,
            "args": [
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
                (("--port", "-p"), {"type": int, "default": 3000, "help": "App port"}),
                (("--secret", "-s"), {"help": "Preflight secret"}),
            ],
        },
        "logs": {
            "help": "Stream or tail container logs",
            "handler": cmd_logs,
            "args": [
                (("--service",), {"help": "Specific service name (omit for all)"}),
                (("--tail",), {"type": int, "default": 50, "help": "Number of lines to show"}),
                (("--follow", "-f"), {"action": "store_true", "help": "Follow log output"}),
            ],
        },
    }
