"""
Backup and restore module for lattice-cli.

Manages Supabase volume backups and config snapshots:
  - Full volume export (Supabase PostgREST data)
  - Config snapshot (.env + compose file)
  - Restore from archive
  - Scheduled backup support (pairs with system cron)

Backups live in ~/.lattice/backups/<instance>/ by default.
"""

import os
import shutil
import sys
import time

from .config import (
    load_config,
    deployment_state,
    save_deployment_state,
    ts,
    LATTICE_HOME,
)
from . import docker_ops


def cmd_create(args):
    """Create a backup of the current deployment."""
    config = load_config()
    instance = args.instance or "default"
    state = deployment_state(instance)

    output_dir = args.output or os.path.expanduser(f"~/.lattice/backups/{instance}")
    os.makedirs(output_dir, exist_ok=True)

    timestamp = ts().replace(":", "-").replace("T", "_").rstrip("Z")
    backup_name = f"backup-{timestamp}"
    backup_path = os.path.join(output_dir, backup_name)
    os.makedirs(backup_path, exist_ok=True)

    print(f"\n  Lattice OS Backup")
    print(f"  {'─' * 50}")
    print(f"  Instance:   {instance}")
    print(f"  Output:     {backup_path}")
    print()

    steps = []

    # 1. Config snapshot
    print(f"  [1/3] Snapshotting config ...", end=" ", flush=True)
    compose_file = config.get("compose_file", "docker-compose.yml")
    for fname in [".env", compose_file]:
        src = os.path.join(".", fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(backup_path, fname))
    print(f"✓")
    steps.append("config")

    # 2. Supabase volume backup (if docker compose is running)
    print(f"  [2/3] Backing up Supabase volumes ...", end=" ", flush=True)
    project_name = config.get("project_name", "lattice")

    # Supabase local dev uses separate volume naming
    volumes = [
        f"{project_name}_db_data",
        f"{project_name}_supabase_db_data",
    ]

    volume_backed = False
    for vol in volumes:
        r_vol = docker_ops._run(
            ["docker", "volume", "inspect", vol], check=False
        )
        if r_vol.returncode == 0:
            tar_path = os.path.join(backup_path, f"{vol}.tar.gz")
            if docker_ops.volume_backup(vol, os.path.dirname(tar_path)):
                print(f"  ✓ {vol}")
                volume_backed = True
            else:
                print(f"  ✗ {vol} (failed)")

    if not volume_backed:
        print(f"  ⚠ No volumes found (using managed Supabase?)")
        steps.append("volumes-none")
    else:
        steps.append("volumes")

    # 3. Metadata
    print(f"  [3/3] Writing metadata ...", end=" ", flush=True)
    metadata = {
        "instance": instance,
        "created_at": ts(),
        "image_tag": state.get("image_tag", "unknown"),
        "steps": steps,
    }
    import json
    with open(os.path.join(backup_path, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"✓")

    # Summary
    total_size = sum(
        os.path.getsize(os.path.join(backup_path, f))
        for f in os.listdir(backup_path)
    )
    size_mb = total_size / (1024 * 1024)

    print(f"\n  ┌─────────────────────────────────────────┐")
    print(f"  │  ✓ Backup complete                     │")
    print(f"  │  Path:  {backup_path:<35}│")
    print(f"  │  Size:  {size_mb:.1f} MB{' ' * (35 - len(f'{size_mb:.1f} MB'))}│")
    print(f"  │  Files: {', '.join(steps):<35}│")
    print(f"  └─────────────────────────────────────────┘")

    # Update state
    state["last_backup"] = ts()
    state["last_backup_path"] = backup_path
    save_deployment_state(instance, state)

    return 0


def cmd_restore(args):
    """Restore a deployment from a backup archive."""
    backup_path = args.path
    if not os.path.isdir(backup_path):
        print(f"  ✗ Backup not found: {backup_path}")
        return 1

    config = load_config()
    instance = args.instance or "default"
    state = deployment_state(instance)

    print(f"\n  Lattice OS Restore")
    print(f"  {'─' * 50}")
    print(f"  Instance:   {instance}")
    print(f"  Source:     {backup_path}")

    # Read metadata
    meta_path = os.path.join(backup_path, "metadata.json")
    if not os.path.exists(meta_path):
        print(f"  ✗ No metadata.json found in backup")
        return 1

    import json
    with open(meta_path) as f:
        metadata = json.load(f)

    print(f"  Created:    {metadata.get('created_at', '?')}")
    print(f"  Tag:        {metadata.get('image_tag', '?')}")
    print(f"  Contents:   {', '.join(metadata.get('steps', []))}")
    print()

    if not args.yes:
        confirm = input("  ⚠ This will overwrite the current deployment. Continue? [y/N] ")
        if confirm.lower() != "y":
            print(f"  Cancelled.")
            return 1

    # Stop current services
    print(f"  [1/3] Stopping current services ...", end=" ", flush=True)
    compose_file = config.get("compose_file", "docker-compose.yml")
    project_name = config.get("project_name", "lattice")
    docker_ops.compose_down(compose_file, project_name)
    print(f"Done")

    # Restore config
    print(f"  [2/3] Restoring config ...", end=" ", flush=True)
    for fname in [".env", compose_file]:
        src = os.path.join(backup_path, fname)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(".", fname))
    print(f"✓")

    # Restore volumes
    print(f"  [3/3] Restoring volumes ...", end=" ", flush=True)
    volume_restored = False
    for fname in os.listdir(backup_path):
        if fname.endswith(".tar.gz"):
            vol_name = fname.replace(".tar.gz", "")
            tar_full = os.path.join(backup_path, fname)
            if docker_ops.volume_restore(vol_name, tar_full):
                print(f"  ✓ {vol_name}")
                volume_restored = True
            else:
                print(f"  ✗ {vol_name}")
    if not volume_restored:
        print(f"  (none)")

    # Restart
    print(f"\n  Starting services ...", end=" ", flush=True)
    env_path = os.path.join(".", ".env")
    ok = docker_ops.compose_up(compose_file, env_path if os.path.exists(env_path) else None, project_name)
    if ok:
        print(f"✓")
    else:
        print(f"✗")
        return 1

    # Update state
    state["restored_at"] = ts()
    state["restored_from"] = backup_path
    state["image_tag"] = metadata.get("image_tag")
    save_deployment_state(instance, state)

    print(f"\n  ✓ Restore complete")
    print(f"    Run `lattice health check` to verify.")
    return 0


def cmd_list(args):
    """List available backups for an instance."""
    instance = args.instance or "default"
    backup_dir = os.path.expanduser(f"~/.lattice/backups/{instance}")

    if not os.path.isdir(backup_dir):
        print(f"  No backups found for instance '{instance}'.")
        return 0

    import json
    backups = []
    for name in sorted(os.listdir(backup_dir)):
        meta_path = os.path.join(backup_dir, name, "metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path) as f:
                meta = json.load(f)
            backups.append((name, meta))

    if not backups:
        print(f"  No backups found for instance '{instance}'.")
        return 0

    print(f"\n  Backups for '{instance}':")
    print(f"  {'─' * 60}")
    for name, meta in backups:
        created = meta.get("created_at", "?")[:16]
        tag = meta.get("image_tag", "?")
        steps = ", ".join(meta.get("steps", []))
        print(f"  {name:<25} {created:<18} tag={tag}")
        print(f"    contents: {steps}")
    print()
    return 0


def get_subcommands():
    return {
        "create": {
            "help": "Create a backup of the current deployment",
            "handler": cmd_create,
            "args": [
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
                (("--output", "-o"), {"help": "Output directory for backup"}),
            ],
        },
        "restore": {
            "help": "Restore a deployment from a backup",
            "handler": cmd_restore,
            "args": [
                (("path",), {"help": "Path to backup directory"}),
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
                (("--yes", "-y"), {"action": "store_true", "help": "Skip confirmation"}),
            ],
        },
        "list": {
            "help": "List available backups",
            "handler": cmd_list,
            "args": [
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
            ],
        },
    }
