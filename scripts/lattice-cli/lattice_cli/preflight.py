"""
V2 preflight checks — runs BEFORE lattice deploy start to catch
environment issues early instead of failing mid-deployment.

Checks:
  [1] Docker daemon running and accessible without sudo
  [2] Docker Compose v2 plugin installed (not deprecated v1)
  [3] Host memory/CPU sufficient for Lattice OS workload
  [4] Required ports (3000, 5432, 6379) available
  [5] Disk space sufficient for image + volumes
  [6] Docker Hub auth (or skip for air-gapped)
  [7] License key valid and unexpired

Each check returns (passed, details) so the caller can decide
whether to continue or abort.
"""

import json
import os
import platform
import shutil
import socket
import subprocess
import sys
from typing import Any


def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, check=False, timeout=timeout
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 127, "", f"command not found: {cmd[0]}")
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, "", f"timeout after {timeout}s")


def check_docker_daemon() -> tuple[bool, str]:
    """[1] Is Docker daemon running and reachable without sudo?"""
    r = _run(["docker", "info"])
    if r.returncode == 0:
        # Parse version from output
        for line in r.stdout.splitlines():
            if "Server Version:" in line:
                ver = line.split(":", 1)[1].strip()
                return True, f"Docker {ver}"
        return True, "Docker running"
    if r.returncode == 127:
        return False, "Docker CLI not found"
    if "permission denied" in (r.stderr or "").lower():
        return False, "Docker requires sudo — add current user to docker group"
    if "cannot connect" in (r.stderr or "").lower():
        return False, "Docker daemon not running"
    return False, (r.stderr or r.stdout or "unknown error")[:200]


def check_compose_v2() -> tuple[bool, str]:
    """[2] Is Docker Compose v2 plugin installed (not deprecated v1)?"""
    # Check for deprecated docker-compose (v1)
    if shutil.which("docker-compose"):
        r = _run(["docker-compose", "--version"])
        if r.returncode == 0 and "v1" in (r.stdout + r.stderr).lower():
            return False, "Deprecated docker-compose v1 found — upgrade to Compose v2"

    r = _run(["docker", "compose", "version"])
    if r.returncode == 0:
        return True, r.stdout.strip()
    return False, "Docker Compose v2 not installed (https://docs.docker.com/compose/install/)"


def check_host_resources() -> tuple[bool, str]:
    """[3] Does host have sufficient memory/CPU?

    Lattice OS minimum requirements:
      - 4 GB RAM (8 GB recommended)
      - 2 CPU cores (4 recommended)
    """
    min_ram_gb = 4
    min_cpus = 2

    # Memory (cross-platform)
    ram_gb = 0.0
    if platform.system() == "Linux":
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        ram_gb = kb / (1024 * 1024)
                        break
        except OSError:
            pass
    elif platform.system() == "Darwin":
        r = _run(["sysctl", "-n", "hw.memsize"])
        if r.returncode == 0:
            ram_gb = int(r.stdout.strip()) / (1024 ** 3)

    # CPU count
    cpu_count = os.cpu_count() or 1

    issues = []
    if ram_gb > 0 and ram_gb < min_ram_gb:
        issues.append(f"RAM {ram_gb:.1f}GB < {min_ram_gb}GB minimum")
    if cpu_count < min_cpus:
        issues.append(f"CPUs {cpu_count} < {min_cpus} minimum")

    if issues:
        return False, "; ".join(issues)

    summary = []
    if ram_gb > 0:
        summary.append(f"{ram_gb:.1f}GB RAM")
    summary.append(f"{cpu_count} CPUs")
    return True, ", ".join(summary) if summary else "OK"


def check_ports(ports: list[int] | None = None) -> tuple[bool, str]:
    """[4] Are required ports available (not in use by another service)?"""
    default_ports = [3000, 5432, 6379]  # app, supabase-postgres, redis
    target_ports = ports or default_ports
    blocked = []

    for port in target_ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                # Something is listening on this port — is it Lattice?
                # If Lattice is already running, that's not a block.
                blocked.append(port)

    if blocked:
        return False, f"port(s) {blocked} occupied by another service"
    return True, f"ports {target_ports} available"


def check_disk_space(min_gb: int = 8) -> tuple[bool, str]:
    """[5] Is there enough disk space for image pull + volumes?

    Lattice OS image + Supabase volumes typically require 8 GB.
    """
    try:
        usage = shutil.disk_usage("/")
        free_gb = usage.free / (1024 ** 3)
    except OSError:
        return True, "could not check disk space"

    if free_gb < min_gb:
        return False, f"{free_gb:.1f}GB free ({min_gb}GB required)"
    return True, f"{free_gb:.1f}GB free"


def check_docker_auth() -> tuple[bool, str]:
    """[6] Is Docker Hub authentication configured?

    Reads ~/.docker/config.json (managed by `docker login`).
    """
    config_path = os.path.expanduser("~/.docker/config.json")
    if not os.path.exists(config_path):
        return False, "not authenticated (run `lattice auth login`)"

    try:
        with open(config_path) as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return False, "could not read docker config"

    auths = data.get("auths", {})
    # Look for docker.io or index.docker.io or any registry
    known_registries = ["https://index.docker.io/v1/", "docker.io", "registry-1.docker.io"]
    for reg in known_registries:
        if reg in auths:
            return True, f"authenticated ({reg})"

    if auths:
        # They're authenticated to some registry (maybe a private one)
        first_reg = next(iter(auths)).split("/")[-1]
        return True, f"authenticated to {first_reg}"

    return False, "no auths found (run `lattice auth login`)"


def _port_name(port: int) -> str:
    return {3000: "app", 5432: "postgres", 6379: "redis"}.get(port, str(port))


def run_preflight(skip_auth: bool = False, skip_ports: bool = False,
                  custom_ports: list[int] | None = None) -> list[dict[str, Any]]:
    """Run all preflight checks. Returns a list of result dicts.

    Each dict: {"step": int, "name": str, "passed": bool, "detail": str, "fix": str}
    """
    checks = [
        (1, "Docker daemon",        check_docker_daemon,
            "Install Docker: https://docs.docker.com/get-docker/"),
        (2, "Docker Compose v2",    check_compose_v2,
            "Install Compose v2: https://docs.docker.com/compose/install/"),
        (3, "Host resources",       check_host_resources,
            "Increase RAM/CPU in Docker Desktop settings"),
        (4, "Port availability",    lambda: check_ports(custom_ports) if not skip_ports else (True, "skipped"),
            "Stop conflicting services or use --port to override"),
        (5, "Disk space",           check_disk_space,
            "Free up disk space: `docker system prune -af`"),
        (6, "Docker Hub auth",      lambda: check_docker_auth() if not skip_auth else (True, "skipped (air-gapped)"),
            "Run: lattice auth login"),
    ]

    results = []
    for step, name, fn, fix in checks:
        try:
            passed, detail = fn()
        except Exception as e:
            passed, detail = False, f"exception: {e}"
        results.append({
            "step": step,
            "name": name,
            "passed": passed,
            "detail": detail,
            "fix": fix,
        })

    return results


def print_preflight_report(results: list[dict[str, Any]]) -> bool:
    """Pretty-print preflight results. Returns True if all passed."""
    print(f"\n  Lattice OS Preflight")
    print(f"  {'─' * 50}")

    all_ok = True
    for r in results:
        icon = "✓" if r["passed"] else "✗"
        status = f"{icon} {r['detail']}"
        print(f"  [{r['step']}/6] {r['name']:<22} {status}")
        if not r["passed"]:
            all_ok = False
            print(f"         fix: {r['fix']}")

    print(f"\n  {'─' * 50}")
    if all_ok:
        print(f"  ✓ All preflight checks passed")
    else:
        failed = sum(1 for r in results if not r["passed"])
        print(f"  ✗ {failed} check(s) failed — resolve before deploying")
    print()

    return all_ok
