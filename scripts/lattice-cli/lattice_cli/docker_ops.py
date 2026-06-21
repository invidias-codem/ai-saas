"""
Docker command abstractions for lattice-cli.

Wraps `docker` and `docker compose` (v2 plugin) invocations so every
other module goes through a single tested surface. Prefers subprocess over
the Docker SDK to avoid pulling the heavy docker-py dependency tree.
"""

import json
import os
import shutil
import subprocess
import sys
from typing import Any

from .config import ts


def _run(cmd: list[str], check: bool = True, capture: bool = True,
         input_data: str | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    """Run a shell command with consistent defaults."""
    try:
        return subprocess.run(
            cmd,
            check=check,
            capture_output=capture,
            text=True,
            input=input_data,
            timeout=timeout,
        )
    except FileNotFoundError:
        print(f"  ✗ Command not found: {cmd[0]}")
        print(f"    Ensure it is installed and on your PATH.")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"  ✗ Timed out after {timeout}s: {' '.join(cmd)}")
        sys.exit(1)


# ─── Prerequisites ────────────────────────────────────────────────────────────

def check_docker() -> bool:
    """Verify `docker` is installed and the daemon is reachable."""
    r = _run(["docker", "info"], check=False)
    if r.returncode != 0:
        print("  ✗ Docker daemon is not running or not reachable.")
        print("    Start Docker Desktop or run `sudo systemctl start docker`.")
        return False
    return True


def check_compose_v2() -> bool:
    """Verify `docker compose` (v2 plugin) is available."""
    r = _run(["docker", "compose", "version"], check=False)
    if r.returncode != 0:
        print("  ✗ Docker Compose v2 plugin not found.")
        print("    Install: https://docs.docker.com/compose/install/")
        return False
    return True


def check_prerequisites() -> bool:
    """Run all prerequisite checks. Exit on failure."""
    ok = check_docker()
    if ok:
        ok = check_compose_v2()
    return ok


# ─── Authentication ───────────────────────────────────────────────────────────

def docker_login(username: str, token: str, registry: str = "docker.io") -> bool:
    """Authenticate via `docker login` using a PAT.

    The token is passed via stdin to avoid leaking it in process listings.
    """
    cmd = ["docker", "login", "--username", username, "--password-stdin"]
    if registry and registry != "docker.io":
        cmd.append(registry)
    r = _run(cmd, check=False, input_data=token)
    if r.returncode == 0:
        print(f"  ✓ Authenticated as {username}")
        return True
    stderr = (r.stderr or "").strip()
    print(f"  ✗ Authentication failed")
    if "unauthorized" in stderr.lower() or "denied" in stderr.lower():
        print("    Token is invalid, expired, or lacks 'pull' scope.")
        print("    Generate a new PAT at: https://hub.docker.com/settings/security")
    else:
        print(f"    {stderr[:200]}")
    return False


def docker_logout(registry: str = "docker.io") -> bool:
    """Log out of Docker registry."""
    cmd = ["docker", "logout"]
    if registry and registry != "docker.io":
        cmd.append(registry)
    r = _run(cmd, check=False)
    return r.returncode == 0


# ─── Image Operations ─────────────────────────────────────────────────────────

def pull_image(image: str, tag: str = "latest") -> bool:
    """Pull a Docker image."""
    ref = f"{image}:{tag}"
    print(f"  ⬇ Pulling {ref} ...")
    r = _run(["docker", "pull", ref], check=False, capture=False, timeout=600)
    if r.returncode == 0:
        print(f"  ✓ Pulled {ref}")
        return True
    print(f"  ✗ Pull failed for {ref}")
    return False


def image_digest(image: str, tag: str = "latest") -> str | None:
    """Return the digest of a local image, or None if not found."""
    ref = f"{image}:{tag}"
    r = _run(
        ["docker", "inspect", "--format", "{{index .RepoDigests 0}}", ref],
        check=False,
    )
    if r.returncode == 0 and r.stdout.strip():
        return r.stdout.strip()
    return None


def list_images(prefix: str = "lattice") -> list[dict[str, str]]:
    """List local images matching a prefix."""
    r = _run(
        ["docker", "images", "--filter", f"reference=*{prefix}*",
         "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"],
        check=False,
    )
    results = []
    if r.returncode == 0:
        for line in r.stdout.strip().splitlines():
            parts = line.split("\t")
            if len(parts) >= 3:
                results.append({"ref": parts[0], "size": parts[1], "created": parts[2]})
    return results


# ─── Compose Operations ──────────────────────────────────────────────────────

def compose_up(compose_file: str, env_file: str | None = None,
               project_name: str = "lattice", detach: bool = True) -> bool:
    """Start services via `docker compose up`."""
    cmd = ["docker", "compose", "-f", compose_file, "-p", project_name]
    if env_file:
        cmd.extend(["--env-file", env_file])
    cmd.append("up")
    if detach:
        cmd.append("-d")
    r = _run(cmd, check=False, capture=False, timeout=600)
    return r.returncode == 0


def compose_down(compose_file: str, project_name: str = "lattice",
                 volumes: bool = False) -> bool:
    """Stop and remove services."""
    cmd = ["docker", "compose", "-f", compose_file, "-p", project_name, "down"]
    if volumes:
        cmd.append("-v")
    r = _run(cmd, check=False, capture=False, timeout=120)
    return r.returncode == 0


def compose_ps(compose_file: str, project_name: str = "lattice") -> list[dict[str, str]]:
    """List running compose services."""
    cmd = [
        "docker", "compose", "-f", compose_file, "-p", project_name,
        "ps", "--format", "json",
    ]
    r = _run(cmd, check=False)
    services = []
    if r.returncode == 0 and r.stdout.strip():
        for line in r.stdout.strip().splitlines():
            try:
                services.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return services


def compose_logs(compose_file: str, project_name: str = "lattice",
                 service: str | None = None, tail: int = 50, follow: bool = False) -> None:
    """Stream or print compose logs."""
    cmd = ["docker", "compose", "-f", compose_file, "-p", project_name, "logs",
           f"--tail={tail}"]
    if follow:
        cmd.append("-f")
    if service:
        cmd.append(service)
    _run(cmd, check=False, capture=False, timeout=3600)


# ─── Container Operations ─────────────────────────────────────────────────────

def container_exec(container: str, cmd: list[str]) -> str | None:
    """Run a command inside a running container."""
    full_cmd = ["docker", "exec", container] + cmd
    r = _run(full_cmd, check=False)
    if r.returncode == 0:
        return r.stdout
    return None


def container_copy_from(container: str, src: str, dst: str) -> bool:
    """Copy a file from a container to the host."""
    r = _run(["docker", "cp", f"{container}:{src}", dst], check=False)
    return r.returncode == 0


def container_copy_to(container: str, src: str, dst: str) -> bool:
    """Copy a file from the host into a container."""
    r = _run(["docker", "cp", src, f"{container}:{dst}"], check=False)
    return r.returncode == 0


# ─── Volume Operations ────────────────────────────────────────────────────────

def volume_backup(volume_name: str, output_path: str) -> bool:
    """Create a tar archive of a Docker volume's contents."""
    # Run a temporary container that mounts the volume and tars it
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{volume_name}:/source:ro",
        "-v", f"{output_path}:/backup",
        "alpine", "tar", "czf", "/backup/volume.tar.gz", "-C", "/source", ".",
    ]
    r = _run(cmd, check=False, capture=False, timeout=600)
    return r.returncode == 0


def volume_restore(volume_name: str, archive_path: str) -> bool:
    """Restore a Docker volume from a tar archive."""
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{volume_name}:/target",
        "-v", f"{os.path.dirname(os.path.abspath(archive_path))}:/backup:ro",
        "alpine", "tar", "xzf", "/backup/" + os.path.basename(archive_path), "-C", "/target",
    ]
    r = _run(cmd, check=False, capture=False, timeout=600)
    return r.returncode == 0


# ─── Network Operations ──────────────────────────────────────────────────────

def test_airgap(image: str, tag: str = "latest") -> dict[str, bool]:
    """Verify a container can run with no outbound network access."""
    results = {"container_created": False, "has_network_access": None}
    container_name = f"lattice-airgap-test-{int(ts().replace('-', '').replace(':', '')[:8])}"
    # Create with --network=none
    r = _run(
        ["docker", "run", "-d", "--network", "none", "--name", container_name,
         f"{image}:{tag}", "sleep", "5"],
        check=False,
    )
    results["container_created"] = r.returncode == 0
    # Clean up
    _run(["docker", "rm", "-f", container_name], check=False)
    return results
