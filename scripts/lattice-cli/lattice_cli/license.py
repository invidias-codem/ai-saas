"""
License activation and management for lattice-cli.

Implements the feature-gated licensing model:
  - Community Edition: free, limited features (no SSO, no RBAC, 5 workspaces)
  - Enterprise:     full-featured (SSO, multi-node, RBAC, unlimited workspaces)

License keys follow the format: LATTICE-<TIER>-<32-hex-chars>
Activation is recorded locally — no phone-home telemetry (data sovereignty).
"""

import json
import re
import sys
from datetime import datetime, timedelta, timezone

from .config import (
    LICENSE_TIERS,
    load_state,
    save_state,
    ts,
)

LICENSE_PATTERN = re.compile(r"^LATTICE-(COM|ENT)-[A-F0-9]{32}$")


def validate_key(key: str) -> tuple[bool, str | None]:
    """Validate a license key format and return (valid, tier)."""
    key = key.strip().upper()
    match = LICENSE_PATTERN.match(key)
    if not match:
        return False, None
    code = match.group(1)
    tier = "community" if code == "COM" else "enterprise"
    return True, tier


def get_active_license() -> dict | None:
    """Return the currently active license, or None."""
    lic = load_state("license")
    if not lic.get("key"):
        return None
    # Check expiry
    if lic.get("expires_at"):
        try:
            expiry = datetime.fromisoformat(lic["expires_at"])
            if expiry < datetime.now(timezone.utc):
                return {**lic, "status": "expired"}
        except (ValueError, TypeError):
            pass
    return {**lic, "status": "active"}


def cmd_activate(args):
    """Activate a Lattice OS license key."""
    key = args.key
    
    # Check if this is a V3 crypto license
    if key.startswith("lattice-v3-"):
        from . import crypto_license
        payload = crypto_license.verify_license_key(key)
        
        if payload is None:
            print(f"  ✗ Invalid V3 license (signature verification failed)")
            return 1
        
        # Extract tier from payload
        tier = payload.get("tier", "community")
        expires = payload.get("expires_at") or (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        
        print(f"  ✓ V3 license signature verified")
        print(f"    Payload: {json.dumps(payload, indent=2)}")
    else:
        # V1/V2 format validation
        valid, tier = validate_key(key)
        if not valid or tier is None:
            print(f"  ✗ Invalid license key format.")
            print(f"    Expected: LATTICE-<TIER>-<32 hex chars> or lattice-v3-<payload>.<signature>")
            print(f"    Got:      {key}")
            return 1
        expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()

    # Check for existing activation
    existing = get_active_license()
    if existing and existing.get("status") == "active":
        print(f"  ⚠ License already active:")
        print(f"    Tier:  {existing.get('tier', 'unknown')}")
        print(f"    Key:   {existing.get('key', '')[:16]}...")
        if not args.force:
            print(f"\n    Use --force to replace the current license.")
            return 1
        print(f"    Replacing with new license ...")

    license_data = {
        "key": key,
        "tier": tier,
        "activated_at": ts(),
        "expires_at": expires,
        "instance_id": args.instance or "default",
    }
    save_state("license", license_data)

    features = LICENSE_TIERS.get(tier, {})
    print(f"\n  ✓ License activated!")
    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  Tier:        {tier.capitalize():<34}│")
    print(f"  │  Key:         {key[:20]}...{'':18}│")
    print(f"  │  Expires:     {expires[:10]:<34}│")
    print(f"  └─────────────────────────────────────────────┘")
    print(f"\n  Features unlocked ({tier}):")
    print(f"    SSO/SAML:              {'✓' if features.get('sso') else '✗'}")
    print(f"    Multi-node:            {'✓' if features.get('multi_node') else '✗'}")
    print(f"    RBAC:                  {'✓' if features.get('rbac') else '✗'}")
    print(f"    Audit retention:       {features.get('audit_log_retention_days', 0)} days")
    print(f"    Workspace limit:        {'unlimited' if features.get('workspace_limit', 0) < 0 else features.get('workspace_limit', 0)}")
    print(f"\n  Run `lattice deploy start` to deploy with this license.")
    return 0


def cmd_deactivate(args):
    """Deactivate the current license (revert to read-only mode)."""
    license_data = load_state("license")
    if not license_data.get("key"):
        print(f"  No active license to deactivate.")
        return 1

    tier = license_data.get("tier", "unknown")
    save_state("license", {})
    print(f"  ✓ License deactivated (was: {tier})")
    print(f"    Instance will revert to read-only mode on next restart.")
    return 0


def cmd_show(args):
    """Show current license status and feature entitlements."""
    license_data = get_active_license()

    if not license_data or not license_data.get("key"):
        print(f"  ✗ No license activated.")
        print(f"    Run: lattice license activate <key>")
        return 1

    status = license_data.get("status", "active")
    tier = license_data.get("tier", "unknown")
    features = LICENSE_TIERS.get(tier, {})

    status_icon = "✓" if status == "active" else "✗"
    print(f"\n  ┌─────────────────────────────────────────────┐")
    print(f"  │  {status_icon} {status.upper():<40}│")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │  Tier:        {tier.capitalize():<34}│")
    print(f"  │  Key:         {license_data['key'][:20]}...{'':18}│")
    print(f"  │  Activated:   {license_data.get('activated_at', '?')[:10]:<34}│")
    print(f"  │  Expires:     {license_data.get('expires_at', '?')[:10]:<34}│")
    print(f"  │  Instance:    {license_data.get('instance_id', '?'):<34}│")
    print(f"  ├─────────────────────────────────────────────┤")
    print(f"  │  SSO/SAML:              {'✓' if features.get('sso') else '✗':<32}│")
    print(f"  │  Multi-node:            {'✓' if features.get('multi_node') else '✗':<32}│")
    print(f"  │  RBAC:                  {'✓' if features.get('rbac') else '✗':<32}│")
    print(f"  │  Audit retention:       {features.get('audit_log_retention_days', 0)} days{' ' * 26}│")
    ws_limit = features.get('workspace_limit', 0)
    ws_display = 'unlimited' if ws_limit < 0 else str(ws_limit)
    print(f"  │  Workspace limit:        {ws_display:<32}│")
    print(f"  └─────────────────────────────────────────────┘")
    return 0


def get_subcommands():
    return {
        "activate": {
            "help": "Activate a Lattice OS license key",
            "handler": cmd_activate,
            "args": [
                (("key",), {"help": "License key (LATTICE-<TIER>-<32 hex chars>)"}),
                (("--force", "-f"), {
                    "action": "store_true",
                    "help": "Replace existing license without confirmation",
                }),
                (("--instance", "-i"), {"default": "default", "help": "Instance name"}),
            ],
        },
        "deactivate": {
            "help": "Deactivate the current license",
            "handler": cmd_deactivate,
            "args": [],
        },
        "show": {
            "help": "Show current license status and features",
            "handler": cmd_show,
            "args": [],
        },
    }
