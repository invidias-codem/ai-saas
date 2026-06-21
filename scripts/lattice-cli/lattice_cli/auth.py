"""
Docker Hub Personal Access Token authentication for lattice-cli.

Supports creating, caching, and using Docker Hub PATs to pull
private Lattice OS images. Designed for the invite-only design
partner phase — PATs are issued manually and distributed out-of-band.

Token scopes needed for Lattice OS pulls:
  - read    (required) — pull images from private repos
  - no write/delete needed unless pushing custom builds

Generate tokens at: https://hub.docker.com/settings/security
"""

import getpass
import json
import secrets
import sys

from .config import load_config, load_state, save_state, ts
from . import docker_ops


def cmd_login(args):
    """Authenticate with Docker Hub using a Personal Access Token.

    Interactive flow:
      1. Prompt for Docker Hub username (or use --username)
      2. Prompt for PAT (masked input via getpass)
      3. Run `docker login --password-stdin`
      4. Cache success status in ~/.lattice/auth.json

    The raw PAT is never stored — only a success flag and timestamp.
    Subsequent `lattice deploy` commands re-use the existing Docker
    credential store.
    """
    config = load_config()
    registry = args.registry or config.get("registry", "docker.io")

    username = args.username
    if not username:
        username = input("  Docker Hub username: ").strip()
    if not username:
        print("  ✗ Username required.")
        return 1

    token = args.token
    if not token:
        print(f"  Paste your Docker Hub Personal Access Token.")
        print(f"  (It will be hidden as you type)\n")
        token = getpass.getpass("  PAT: ").strip()
    if not token:
        print("  ✗ Token required.")
        return 1

    print(f"\n  Authenticating to {registry} as {username} ...")
    ok = docker_ops.docker_login(username, token, registry)

    if ok:
        auth = {
            "username": username,
            "registry": registry,
            "authenticated_at": ts(),
            "method": "pat",
            "scope": "read",
        }
        save_state("auth", auth)
        print(f"\n  ✓ Login successful. Credentials cached in ~/.lattice/auth.json")
        print(f"    You can now pull private Lattice OS images.")
        return 0
    else:
        return 1


def cmd_logout(args):
    """Log out of Docker Hub and clear cached auth state."""
    config = load_config()
    registry = args.registry or config.get("registry", "docker.io")

    docker_ops.docker_logout(registry)
    save_state("auth", {})
    print(f"  ✓ Logged out of {registry}")
    return 0


def cmd_status(args):
    """Show current authentication status."""
    auth = load_state("auth")
    if auth.get("username"):
        print(f"  Registry:    {auth.get('registry', 'docker.io')}")
        print(f"  Username:    {auth['username']}")
        print(f"  Method:      {auth.get('method', 'unknown')}")
        print(f"  Authenticated: {auth.get('authenticated_at', 'unknown')}")
        print(f"\n  ✓ Authenticated")
    else:
        print(f"  ✗ Not authenticated.")
        print(f"    Run: lattice auth login")
    return 0


def cmd_generate_token(args):
    """Generate a local license token for design partner distribution.

    This is NOT a Docker Hub PAT — it is a Lattice OS deployment license
    token that can be activated via `lattice license activate`.

    Format: LATTICE-<tier>-<random-hex>
    Example: LATTICE-ENT-a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5
    """
    tier = args.tier.upper()[:3]
    token = secrets.token_hex(16).upper()
    license_key = f"LATTICE-{tier}-{token}"

    print(f"  Generated license key:")
    print(f"\n  {license_key}\n")
    print(f"  Tier:  {args.tier.capitalize()}")
    print(f"  Scope: Distribution (single instance)")

    if args.save:
        tokens = load_state("generated_tokens")
        generated = tokens.get("tokens", [])
        generated.append({
            "key": license_key,
            "tier": args.tier,
            "generated_at": ts(),
            "activated": False,
        })
        tokens["tokens"] = generated
        save_state("generated_tokens", tokens)
        print(f"\n  ✓ Saved to ~/.lattice/generated_tokens.json")

    print(f"\n  ⚠  Store this key securely. It is not recoverable.")
    return 0


def get_subcommands():
    """Return argparse subparsers for the auth command group."""
    return {
        "login": {
            "help": "Authenticate with Docker Hub using a Personal Access Token",
            "handler": cmd_login,
            "args": [
                (("--username", "-u"), {"help": "Docker Hub username"}),
                (("--token", "-t"), {"help": "Personal Access Token (omit to prompt)"}),
                (("--registry", "-r"), {"help": "Registry URL (default: docker.io)"}),
            ],
        },
        "logout": {
            "help": "Log out of Docker Hub and clear cached credentials",
            "handler": cmd_logout,
            "args": [
                (("--registry", "-r"), {"help": "Registry URL (default: docker.io)"}),
            ],
        },
        "status": {
            "help": "Show current Docker Hub authentication status",
            "handler": cmd_status,
            "args": [],
        },
        "generate": {
            "help": "Generate a Lattice OS deployment license token",
            "handler": cmd_generate_token,
            "args": [
                (("--tier",), {
                    "choices": ["community", "enterprise"],
                    "default": "enterprise",
                    "help": "License tier (default: enterprise)",
                }),
                (("--save", "-s"), {
                    "action": "store_true",
                    "help": "Save to ~/.lattice/generated_tokens.json",
                }),
            ],
        },
    }
