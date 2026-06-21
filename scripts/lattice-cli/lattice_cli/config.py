"""
Shared configuration and state management for lattice-cli.

All persistent state lives in ~/.lattice/:
  - config.toml    — user preferences, registry URL, image tag
  - auth.json      — Docker Hub PAT and cached login status
  - license.json   — activated license key, tier, expiry
  - deployments/   — per-instance deployment state
"""

import json
import os
import time
from pathlib import Path
from typing import Any

# XDG-friendly config root
LATTICE_HOME = Path(os.environ.get("LATTICE_HOME", Path.home() / ".lattice"))

DEFAULT_CONFIG: dict[str, Any] = {
    "registry": "docker.io",
    "image": "lattice-os",
    "tag": "latest",
    "deployment_mode": "standard",  # "standard" | "air-gapped"
    "preflight_secret_name": "PREFLIGHT_SECRET",
    "compose_file": "docker-compose.yml",
}

LICENSE_TIERS = {
    "community": {
        "sso": False,
        "multi_node": False,
        "rbac": False,
        "audit_log_retention_days": 30,
        "workspace_limit": 5,
    },
    "enterprise": {
        "sso": True,
        "multi_node": True,
        "rbac": True,
        "audit_log_retention_days": 3650,
        "workspace_limit": -1,  # unlimited
    },
}


def ensure_home():
    """Create ~/.lattice/ directory structure if missing."""
    LATTICE_HOME.mkdir(parents=True, exist_ok=True)
    (LATTICE_HOME / "deployments").mkdir(exist_ok=True)
    return LATTICE_HOME


def load_config():
    """Load (or create default) config.toml."""
    config_path = LATTICE_HOME / "config.toml"
    if config_path.exists():
        # Minimal TOML parser — only key = "value" or key = number lines.
        config = dict(DEFAULT_CONFIG)
        for line in config_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key in DEFAULT_CONFIG:
                expected = type(DEFAULT_CONFIG[key])
                if expected == int:
                    value = int(value)
                config[key] = value
        return config
    else:
        save_config(DEFAULT_CONFIG)
        return dict(DEFAULT_CONFIG)


def save_config(config):
    """Write config.toml."""
    ensure_home()
    lines = [f"{k} = {json.dumps(v)}" for k, v in config.items()]
    (LATTICE_HOME / "config.toml").write_text("\n".join(lines) + "\n")


def load_state(name):
    """Load a JSON state file (auth.json, license.json, etc.)."""
    path = LATTICE_HOME / f"{name}.json"
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def save_state(name, data):
    """Persist a JSON state file."""
    ensure_home()
    path = LATTICE_HOME / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")
    # Restrict permissions — PATs and license keys live here
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass  # Windows / unusual filesystems


def deployment_state(instance_name="default"):
    """Load or create deployment state for a named instance."""
    path = LATTICE_HOME / "deployments" / f"{instance_name}.json"
    if path.exists():
        return json.loads(path.read_text())
    return {
        "name": instance_name,
        "deployed_at": None,
        "image_tag": None,
        "license_tier": None,
        "last_health_check": None,
        "workspace_count": 0,
    }


def save_deployment_state(instance_name, state):
    """Persist deployment state."""
    ensure_home()
    path = LATTICE_HOME / "deployments" / f"{instance_name}.json"
    path.write_text(json.dumps(state, indent=2, default=str) + "\n")


def ts():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
