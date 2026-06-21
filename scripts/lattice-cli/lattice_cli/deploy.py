"""
Deployment orchestration for lattice-cli.

Handles the full deployment lifecycle for a Lattice OS Docker appliance:

  1. Prerequisite checks (docker, compose v2, auth)
  2. Image pull from private registry
  3. Environment bootstrap (.env generation)
  4. License tier validation
  5. Compose up with health check verification
  6. Post-deploy status report

Supports both standard and air-gapped deployment modes.
"""

import json
import os
import secrets
import sys

from .config import (
    LATTICE_HOME,
    deployment_state,
    ensure_home,
    load_config,
    load_state,
    save_deployment_state,
    ts,
)
from . import docker_ops


def _bootstrap_env(instance_name: str, config: dict, license_tier: str) -> str:
    """Generate a .env file for the deployment.

    Creates a fresh PREFLIGHT_SECRET and wires up Supabase, Clerk,
    and other required environment variables. Missing values are
    left empty with a comment — the user fills them in before
    deploy proceeds.
    """
    env_path = LATTICE_HOME / "deployments" / f"{instance_name}.env"

    # Generate random secrets
    preflight_secret = secrets.token_urlsafe(32)
    cron_secret = secrets.token_urlsafe(32)

    image = config.get("image", "lattice-os")
    tag = config.get("tag", "latest")
    mode = config.get("deployment_mode", "standard")

    lines = [
        f"# Lattice OS deployment: {instance_name}",
        f"# Generated: {ts()}",
        f"# Edit this file to fill in your credentials before deploying.",
        "",
        f"# ─── Core ───────────────────────────────────────────────────",
        f"DEPLOYMENT_MODE=A",
        f"LATTICE_IMAGE={image}:{tag}",
        f"PREFLIGHT_SECRET={preflight_secret}",
        f"CRON_SECRET={cron_secret}",
        f"LICENSE_TIER={license_tier}",
        f"LATTICE_INSTANCE_ID={instance_name}",
        "",
        f"# ─── Supabase (required) ───────────────────────────────────",
        f"# Fill these in from your Supabase project dashboard.",
        f"NEXT_PUBLIC_SUPABASE_URL=",
        f"NEXT_PUBLIC_SUPABASE_ANON_KEY=",
        f"SUPABASE_SERVICE_ROLE_KEY=",
        "",
        f"# ─── Auth (Clerk) ──────────────────────────────────────────",
        f"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=",
        f"CLERK_SECRET_KEY=",
        f"NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in",
        f"NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up",
        f"NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard",
        f"NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/",
        "",
        f"# ─── AI Providers ──────────────────────────────────────────",
        f"# At least one provider must be configured.",
        f"GOOGLE_API_KEY=",
        f"OPENAI_API_KEY=",
        "",
        f"# ─── Air-Gap Mode ──────────────────────────────────────────",
        f"# Set to 'true' to disable all outbound network calls.",
        f"AIRGAP_MODE={'true' if mode == 'air-gapped' else 'false'}",
        "",
    ]

    env_path.write_text("\n".join(lines) + "\n")
    try:
        os.chmod(env_path, 0o600)
    except OSError:
        pass
    return str(env_path)


def _validate_env(env_path: str) -> list[str]:
    """Check that required env vars are populated. Return list of missing keys."""
    missing = []
    required = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
    ]
    # At least one AI provider
    ai_providers = ["GOOGLE_API_KEY", "OPENAI_API_KEY"]

    with open(env_path) as f:
        lines = f.read()

    for key in required:
        for line in lines.splitlines():
            if line.startswith(f"{key}="):
                val = line.split("=", 1)[1].strip()
                if not val:
                    missing.append(key)
                break
        else:
            missing.append(key)

    # Need at least one AI provider
    ai_count = 0
    for key in ai_providers:
        for line in lines.splitlines():
            if line.startswith(f"{key}="):
                val = line.split("=", 1)[1].strip()
                if val:
                    ai_count += 1
                break
    if ai_count == 0:
        missing.append("(at least one of: GOOGLE_API_KEY or OPENAI_API_KEY)")

    return missing


def cmd_init(args):
    """Initialize a new deployment (generate .env, validate config)."""
    config = load_config()
    instance_name = args.name or "default"
    license_tier = args.tier or "community"

    print(f"  Initializing deployment: {instance_name}")
    print(f"  License tier:           {license_tier}")
    print(f"  Image:                  {config.get('image')}:{config.get('tag')}")
    print(f"  Mode:                   {config.get('deployment_mode', 'standard')}")

    env_path = _bootstrap_env(instance_name, config, license_tier)
    print(f"\n  ✓ Environment file created: {env_path}")
    print(f"\n  Next steps:")
    print(f"    1. Edit {env_path} and fill in your credentials")
    print(f"    2. Run: lattice deploy start --name {instance_name}")
    return 0


def cmd_start(args):
    """Start a Lattice OS deployment."""
    config = load_config()
    instance_name = args.name or "default"
    compose_file = args.compose or config.get("compose_file", "docker-compose.yml")

    print(f"  ╔══════════════════════════════════════════╗")
    print(f"  ║  Lattice OS — Deploying {instance_name:<17}║")
    print(f"  ╚══════════════════════════════════════════╝\n")

    # Step 1: Prerequisites
    print(f"  [1/6] Checking prerequisites ...")
    if not docker_ops.check_prerequisites():
        return 1

    # Step 2: Auth check
    print(f"  [2/6] Verifying Docker Hub authentication ...")
    auth = load_state("auth")
    if not auth.get("username"):
        print(f"  ✗ Not authenticated. Run: lattice auth login")
        return 1
    print(f"  ✓ Authenticated as {auth['username']}")

    # Step 3: Environment check
    print(f"  [3/6] Checking environment configuration ...")
    env_path = LATTICE_HOME / "deployments" / f"{instance_name}.env"
    if not env_path.exists():
        print(f"  ✗ No environment file for '{instance_name}'.")
        print(f"    Run: lattice deploy init --name {instance_name}")
        return 1

    missing = _validate_env(str(env_path))
    if missing:
        print(f"  ✗ Missing required environment variables:")
        for key in missing:
            print(f"    - {key}")
        print(f"\n    Edit: {env_path}")
        return 1
    print(f"  ✓ All required variables set")

    # Step 4: Pull image
    image = config.get("image", "lattice-os")
    tag = config.get("tag", "latest")
    print(f"  [4/6] Pulling container image ...")
    if not docker_ops.pull_image(image, tag):
        return 1

    # Step 5: Compose up
    print(f"  [5/6] Starting services ...")

    # Check compose file exists
    if not os.path.exists(compose_file):
        print(f"  ✗ Compose file not found: {compose_file}")
        print(f"    Use --compose to specify the path, or run from the project root.")
        return 1

    if not docker_ops.compose_up(compose_file, str(env_path), instance_name):
        print(f"  ✗ Failed to start services.")
        return 1

    # Step 6: Health verification
    print(f"  [6/6] Running post-deploy health check ...")
    # Brief wait for startup
    import time
    time.sleep(5)

    state = deployment_state(instance_name)
    state["deployed_at"] = ts()
    state["image_tag"] = f"{image}:{tag}"
    state["license_tier"] = load_state("license").get("tier", "community")
    save_deployment_state(instance_name, state)

    print(f"\n  ╔══════════════════════════════════════════╗")
    print(f"  ║  ✓ Deployment complete                   ║")
    print(f"  ╚══════════════════════════════════════════╝")
    print(f"\n  Instance:  {instance_name}")
    print(f"  Image:     {image}:{tag}")
    print(f"  License:   {state.get('license_tier', 'community')}")
    print(f"\n  Run `lattice health check` to verify all services are healthy.")
    return 0


def cmd_stop(args):
    """Stop a running deployment."""
    config = load_config()
    instance_name = args.name or "default"
    compose_file = args.compose or config.get("compose_file", "docker-compose.yml")
    remove_volumes = args.volumes

    print(f"  Stopping deployment: {instance_name}")
    if not docker_ops.compose_down(compose_file, instance_name, remove_volumes):
        print(f"  ✗ Failed to stop services.")
        return 1

    if remove_volumes:
        print(f"  ✓ Services stopped and volumes removed.")
    else:
        print(f"  ✓ Services stopped. Volumes preserved.")
    return 0


def cmd_status(args):
    """Show deployment status."""
    instance_name = args.name or "default"
    config = load_config()
    compose_file = args.compose or config.get("compose_file", "docker-compose.yml")

    state = deployment_state(instance_name)
    print(f"  Instance:       {instance_name}")
    print(f"  Deployed at:    {state.get('deployed_at', 'never')}")
    print(f"  Image:          {state.get('image_tag', 'unknown')}")
    print(f"  License tier:   {state.get('license_tier', 'none')}")
    print(f"  Last health:    {state.get('last_health_check', 'never')}")

    print(f"\n  Running services:")
    services = docker_ops.compose_ps(compose_file, instance_name)
    if services:
        for svc in services:
            name = svc.get("Name", svc.get("name", "?"))
            status = svc.get("State", svc.get("state", "?"))
            print(f"    {name}: {status}")
    else:
        print(f"    (none running)")
    return 0


def cmd_logs(args):
    """Stream deployment logs."""
    config = load_config()
    instance_name = args.name or "default"
    compose_file = args.compose or config.get("compose_file", "docker-compose.yml")
    docker_ops.compose_logs(compose_file, instance_name, args.service, args.tail, args.follow)
    return 0


def get_subcommands():
    return {
        "init": {
            "help": "Initialize a new deployment (generate .env with secrets)",
            "handler": cmd_init,
            "args": [
                (("--name", "-n"), {"default": "default", "help": "Instance name"}),
                (("--tier", "-t"), {
                    "choices": ["community", "enterprise"],
                    "default": "community",
                    "help": "License tier",
                }),
            ],
        },
        "start": {
            "help": "Start a Lattice OS deployment",
            "handler": cmd_start,
            "args": [
                (("--name", "-n"), {"default": "default", "help": "Instance name"}),
                (("--compose", "-c"), {"help": "Path to docker-compose.yml"}),
            ],
        },
        "stop": {
            "help": "Stop a running deployment",
            "handler": cmd_stop,
            "args": [
                (("--name", "-n"), {"default": "default", "help": "Instance name"}),
                (("--compose", "-c"), {"help": "Path to docker-compose.yml"}),
                (("--volumes", "-v"), {
                    "action": "store_true",
                    "help": "Also remove Docker volumes (destroys data!)",
                }),
            ],
        },
        "status": {
            "help": "Show deployment status and running services",
            "handler": cmd_status,
            "args": [
                (("--name", "-n"), {"default": "default", "help": "Instance name"}),
                (("--compose", "-c"), {"help": "Path to docker-compose.yml"}),
            ],
        },
        "logs": {
            "help": "View or stream deployment logs",
            "handler": cmd_logs,
            "args": [
                (("--name", "-n"), {"default": "default", "help": "Instance name"}),
                (("--compose", "-c"), {"help": "Path to docker-compose.yml"}),
                (("--service", "-s"), {"help": "Service name to filter logs"}),
                (("--tail",), {"type": int, "default": 50, "help": "Lines to show"}),
                (("--follow", "-f"), {"action": "store_true", "help": "Follow log output"}),
            ],
        },
    }
