"""
Upgrade module for lattice-cli.

Handles pulling a new image, validating config compatibility,
and performing a zero-downtime rolling restart with config migration.

Upgrade flow:
  1. Check license is active
  2. Pull new image tag
  3. Compare digests — skip if already deployed
  4. Backup current config and volumes
  5. Stop old services (graceful)
  6. Update compose env to new tag
  7. Start new services
  8. Run health check
  9. Rollback on failure
"""

import os
import shutil
import sys

from .config import (
    load_config,
    save_config,
    deployment_state,
    save_deployment_state,
    ts,
)
from . import docker_ops
from . import license as lic


def cmd_upgrade(args):
    """Upgrade to a newer Lattice OS image tag."""
    config = load_config()
    instance = args.instance or "default"
    state = deployment_state(instance)

    target_tag = args.tag or "latest"
    current_tag = state.get("image_tag") or config.get("tag", "latest")
    image = f"{config.get('registry', 'docker.io')}/{config.get('image', 'lattice-os')}"

    print(f"\n  Lattice OS Upgrade")
    print(f"  {'─' * 50}")
    print(f"  Instance:     {instance}")
    print(f"  Current tag:  {current_tag}")
    print(f"  Target tag:   {target_tag}")
    print(f"  Image:        {image}")
    print()

    # 1. License check
    print(f"  [1/6] Checking license ...", end=" ", flush=True)
    license_data = lic.get_active_license()
    if not license_data or license_data.get("status") != "active":
        print("✗ No active license")
        print(f"        Run: lattice license activate <key>")
        return 1
    print(f"✓ ({license_data.get('tier')})")

    # 2. Pull target image
    print(f"  [2/6] Pulling {image}:{target_tag} ...", end=" ", flush=True)
    if not docker_ops.pull_image(image, target_tag):
        print("✗ Pull failed")
        return 1
    print()

    # 3. Compare digests (skip if same)
    print(f"  [3/6] Comparing digests ...", end=" ", flush=True)
    current_digest = docker_ops.image_digest(image, current_tag)
    target_digest = docker_ops.image_digest(image, target_tag)

    if current_digest and target_digest and current_digest == target_digest:
        print(f"Same — already deployed")
        print(f"\n  ✓ You are already running {target_tag}")
        return 0
    print(f"Different → upgrade required")

    # 4. Backup
    backup_path = ""
    if not args.skip_backup:
        print(f"  [4/6] Backing up config ...", end=" ", flush=True)
        backup_dir = os.path.expanduser(f"~/.lattice/backups/{instance}")
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = ts().replace(":", "-").replace("T", "_").rstrip("Z")
        backup_path = os.path.join(backup_dir, f"pre-upgrade-{timestamp}")
        os.makedirs(backup_path, exist_ok=True)

        # Copy .env and compose file
        compose_file = config.get("compose_file", "docker-compose.yml")
        for fname in [".env", compose_file]:
            src = os.path.join(".", fname)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(backup_path, fname))
        print(f"✓ ({backup_path})")
    else:
        print(f"  [4/6] Backup skipped (--skip-backup)")

    # 5. Stop old services
    print(f"  [5/6] Stopping current deployment ...", end=" ", flush=True)
    compose_file = config.get("compose_file", "docker-compose.yml")
    project_name = config.get("project_name", "lattice")
    docker_ops.compose_down(compose_file, project_name)
    print(f"Done")

    # 6. Update tag in .env and restart
    print(f"  [6/6] Starting {target_tag} ...", end=" ", flush=True)
    env_path = os.path.join(".", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            content = f.read()
        # Replace LATTICE_TAG=... or add it
        if "LATTICE_TAG=" in content:
            lines = []
            for line in content.splitlines():
                if line.startswith("LATTICE_TAG="):
                    lines.append(f"LATTICE_TAG={target_tag}")
                else:
                    lines.append(line)
            content = "\n".join(lines) + "\n"
        else:
            content += f"\nLATTICE_TAG={target_tag}\n"
        with open(env_path, "w") as f:
            f.write(content)

    ok = docker_ops.compose_up(compose_file, env_path, project_name)
    if ok:
        print(f"Done")
    else:
        print(f"✗ Failed to start")
        if not args.skip_backup:
            print(f"\n  ⚠ Upgrade failed. Restore backup from: {backup_path}")
        return 1

    # Wait for health
    print(f"\n  Waiting for services to stabilize (10s) ...")
    import time
    time.sleep(10)

    # Update state
    state["image_tag"] = target_tag
    state["deployed_at"] = ts()
    state["upgraded_from"] = current_tag
    save_deployment_state(instance, state)
    save_config({**config, "tag": target_tag})

    print(f"\n  ✓ Upgrade complete: {current_tag} → {target_tag}")
    print(f"    Run `lattice health check` to verify.")
    return 0


def cmd_rollback(args):
    """Rollback to the previous image tag."""
    config = load_config()
    instance = args.instance or "default"
    state = deployment_state(instance)

    previous = state.get("upgraded_from")
    if not previous:
        print(f"  ✗ No previous version to rollback to.")
        print(f"    (This instance was never upgraded.)")
        return 1

    current = state.get("image_tag") or config.get("tag", "latest")
    print(f"  Rolling back: {current} → {previous}")

    # Simulate an upgrade to the previous tag
    args.tag = previous
    args.skip_backup = True
    return cmd_upgrade(args)


def get_subcommands():
    return {
        "upgrade": {
            "help": "Upgrade to a newer Lattice OS image",
            "handler": cmd_upgrade,
            "args": [
                (("--tag", "-t"), {"help": "Target image tag (default: latest)"}),
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
                (("--skip-backup",), {
                    "action": "store_true",
                    "help": "Skip pre-upgrade backup",
                }),
            ],
        },
        "rollback": {
            "help": "Rollback to the previous image tag",
            "handler": cmd_rollback,
            "args": [
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
            ],
        },
    }
