#!/usr/bin/env python3
"""
cloudflare_harden.py — Automate gen1e.xyz security hardening via Cloudflare API

Implements:
  1. SPF + DMARC DNS records
  2. Transform Rules to strip x-vercel-* and x-clerk-* headers
  3. WAF rules (block WordPress probes)
  4. SSL/TLS verification
  5. Verification sweep

Usage:
  python3 scripts/cloudflare_harden.py --token YOUR_TOKEN --zone YOUR_ZONE_ID

API token must have these permissions:
  - Zone.DNS: Edit
  - Zone.Rules: Edit
  - Zone.Filters: Edit
  - Zone.Settings: Read
"""

import argparse
import json
import os
import sys
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = "https://api.cloudflare.com/client/v4"

def cf(method, path, token, body=None):
    """Make a Cloudflare API call and return parsed JSON."""
    url = f"{BASE}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        err_body = e.read().decode()
        print(f"  ❌ {method} {path} → {e.code}")
        try:
            parsed = json.loads(err_body)
            for err in parsed.get("errors", []):
                print(f"     └─ {err.get('code')}: {err.get('message')}")
        except Exception:
            print(f"     └─ {err_body[:500]}")
        return None

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ─── 1. DNS Records ──────────────────────────────────────────────────────────────

def setup_dns(token, zone_id, dry_run=False):
    section("1. DNS Records — SPF + DMARC")

    records = [
        {
            "type": "TXT",
            "name": "gen1e.xyz",
            "content": "v=spf1 include:_spf.google.com ~all",
            "comment": "SPF record — prevents email spoofing",
        },
        {
            "type": "TXT",
            "name": "_dmarc.gen1e.xyz",
            "content": "v=DMARC1; p=quarantine; rua=mailto:admin@gen1e.xyz; adkim=s; aspf=s",
            "comment": "DMARC policy — quarantine failing SPF/DKIM, report to admin",
        },
    ]

    for rec in records:
        display = f"{rec['type']}  {rec['name']} → {rec['content']}"
        print(f"\n  📋 {display}")

        # Check if record already exists
        existing = cf("GET", f"/zones/{zone_id}/dns_records?type=TXT&name={rec['name']}", token)
        if existing and existing.get("success"):
            for r in existing.get("result", []):
                if rec["content"] in r.get("content", ""):
                    print(f"     ✅ Already exists (id: {r['id']})")
                    break
            else:
                # Check for conflicting records
                if rec["name"] == "gen1e.xyz":
                    has_spf = any("v=spf1" in (r.get("content") or "") for r in existing.get("result", []))
                    if has_spf:
                        print(f"     ⚠️  SPF record already exists — skipping to avoid conflict")
                        print(f"     Review manually: existing records will NOT be overwritten")
                        continue
                if rec["name"] == "_dmarc.gen1e.xyz":
                    has_dmarc = any("v=DMARC1" in (r.get("content") or "") for r in existing.get("result", []))
                    if has_dmarc:
                        print(f"     ⚠️  DMARC record already exists — skipping to avoid conflict")
                        continue

                if dry_run:
                    print(f"     🔒 DRY RUN — would create")
                else:
                    result = cf("POST", f"/zones/{zone_id}/dns_records", token, rec)
                    if result and result.get("success"):
                        print(f"     ✅ Created (id: {result['result']['id']})")
                    elif result:
                        print(f"     ❌ Failed: {json.dumps(result.get('errors', []))}")
        else:
            print(f"     ❌ Could not query existing records")

# ─── 2. Transform Rules — Strip Info-Leaking Headers ─────────────────────────────

def setup_transform_rules(token, zone_id, dry_run=False):
    section("2. Transform Rules — Strip Info-Leaking Headers")

    headers_to_remove = [
        "x-vercel-id",
        "x-vercel-cache",
        "x-matched-path",
        "x-clerk-auth-status",
        "x-clerk-auth-reason",
    ]

    body = {
        "description": "Strip info-leaking response headers (Vercel + Clerk)",
        "enabled": True,
        "action": "remove",
        "action_parameters": {
            "headers": {h: {} for h in headers_to_remove}
        },
        "expression": '(http.host eq "gen1e.xyz" or http.host eq "www.gen1e.xyz")',
    }

    print(f"\n  📋 Remove response headers: {', '.join(headers_to_remove)}")
    print(f"     Scope: all requests to gen1e.xyz / www.gen1e.xyz")

    if dry_run:
        print(f"     🔒 DRY RUN — would create Transform Rule")
        print(f"     Payload: {json.dumps(body, indent=2)[:300]}...")
    else:
        # Check existing transform rules
        existing = cf("GET", f"/zones/{zone_id}/rules/phases/{'http_response_headers_transform'}/entrypoints/custom/rules", token)

        result = cf("POST", f"/zones/{zone_id}/rulesets/phases/{'http_response_headers_transform'}/custom", token, {
            "description": "Strip info-leaking response headers",
            "kind": "zone",
            "name": "default",
            "phase": "http_response_headers_transform",
            "rules": [body],
        })

        if result and result.get("success"):
            print(f"     ✅ Transform ruleset created (id: {result['result']['id']})")
        elif result:
            # Might already exist — try updating
            errors = result.get("errors", [])
            if any("already exists" in str(e.get("message", "")) for e in errors):
                print(f"     ⚠️  Ruleset already exists — updating")
                # Get existing ruleset
                rulesets = cf("GET", f"/zones/{zone_id}/rulesets", token)
                if rulesets:
                    for rs in rulesets.get("result", []):
                        if rs.get("phase") == "http_response_headers_transform" and rs.get("kind") == "zone":
                            rs_id = rs["id"]
                            update = cf("PUT", f"/zones/{zone_id}/rulesets/{rs_id}", token, {"rules": [body]})
                            if update and update.get("success"):
                                print(f"     ✅ Updated existing rules (id: {rs_id})")
                            else:
                                print(f"     ❌ Update failed")
                            break
            else:
                print(f"     ❌ Failed: {json.dumps(errors)}")

# ─── 3. WAF Rules ─────────────────────────────────────────────────────────────────

def setup_waf_rules(token, zone_id, dry_run=False):
    section("3. WAF Rules — Block WordPress Probes")

    waf_rules = [
        {
            "description": "Block WordPress config/admin probes",
            "expression": '(http.request.uri.path contains "wp-config") or (http.request.uri.path contains "wp-admin") or (http.request.uri.path contains "xmlrpc.php") or (http.request.uri.path contains ".php.bak")',
            "action": "block",
            "ref": "wp-probes",
            "enabled": True,
        }
    ]

    for rule in waf_rules:
        print(f"\n  📋 {rule['description']}")
        print(f"     Expression: {rule['expression'][:100]}...")
        print(f"     Action: {rule['action']}")

        if dry_run:
            print(f"     🔒 DRY RUN — would create")
        else:
            # Get existing ruleset
            rulesets = cf("GET", f"/zones/{zone_id}/rulesets", token)
            if rulesets and rulesets.get("success"):
                managed_rs = None
                for rs in rulesets.get("result", []):
                    if rs.get("phase") == "http_request_firewall_custom" and rs.get("kind") == "zone":
                        managed_rs = rs
                        break

                if managed_rs:
                    # Add rule to existing ruleset
                    existing_rules = managed_rs.get("rules", []) or []
                    new_rules = existing_rules + [{"description": rule["description"], "expression": rule["expression"], "action": rule["action"], "enabled": True}]
                    update = cf("PUT", f"/zones/{zone_id}/rulesets/{managed_rs['id']}", token, {"rules": new_rules})
                    if update and update.get("success"):
                        print(f"     ✅ Added to existing ruleset (id: {managed_rs['id']})")
                    else:
                        print(f"     ❌ Failed to update ruleset")
                else:
                    # Create new ruleset
                    body = {
                        "name": "wp-probe-blocking",
                        "description": "Block WordPress and backup file probes",
                        "kind": "zone",
                        "phase": "http_request_firewall_custom",
                        "rules": [{"description": rule["description"], "expression": rule["expression"], "action": rule["action"], "enabled": True}],
                    }
                    result = cf("POST", f"/zones/{zone_id}/rulesets", token, body)
                    if result and result.get("success"):
                        print(f"     ✅ Created WAF rulesset (id: {result['result']['id']})")
                    elif result:
                        print(f"     ❌ Failed: {json.dumps(result.get('errors', []))}")

# ─── 4. SSL/TLS Verification ──────────────────────────────────────────────────────

def verify_ssl(token, zone_id, dry_run=False):
    section("4. SSL/TLS Settings Verification")

    settings = [
        ("ssl", "SSL/TLS Mode"),
        ("security_level", "Security Level"),
        ("min_tls_version", "Minimum TLS Version"),
        ("always_use_https", "Always Use HTTPS"),
        ("automatic_https_rewrites", "Automatic HTTPS Rewrites"),
    ]

    for setting_id, label in settings:
        result = cf("GET", f"/zones/{zone_id}/settings/{setting_id}", token)
        if result and result.get("success"):
            value = result["result"].get("value", "unknown")
            print(f"  ✅ {label}: {value}")
        else:
            print(f"  ❓ {label}: could not read")

# ─── 5. Verification Sweep ────────────────────────────────────────────────────────

def verify_all(token, zone_id):
    section("5. Verification Sweep — DNS Records")

    # Check SPF
    result = cf("GET", f"/zones/{zone_id}/dns_records?type=TXT&name=gen1e.xyz", token)
    if result and result.get("success"):
        spf_ok = any("v=spf1" in (r.get("content") or "") for r in result.get("result", []))
        print(f"  {'✅' if spf_ok else '❌'} SPF record: {'present' if spf_ok else 'MISSING'}")

    # Check DMARC
    result = cf("GET", f"/zones/{zone_id}/dns_records?type=TXT&name=_dmarc.gen1e.xyz", token)
    if result and result.get("success"):
        dmarc_ok = any("v=DMARC1" in (r.get("content") or "") for r in result.get("result", []))
        print(f"  {'✅' if dmarc_ok else '❌'} DMARC record: {'present' if dmarc_ok else 'MISSING'}")

    # Check transform rules
    print(f"\n  ℹ️  Transform Rules — test via browser DevTools (Network tab) after deploy")
    print(f"     curl -sI https://gen1e.xyz | grep -i x-vercel  → should be empty")
    print(f"     curl -sI https://gen1e.xyz | grep -i x-clerk  → should be empty")

    # Note about CORS (set in next.config.mjs, not Cloudflare)
    print(f"\n  ℹ️  CORS headers — set in next.config.mjs (PR #247)")
    print(f"     curl -sI https://gen1e.xyz | grep access-control-allow-origin")
    print(f"     Expected: gen1e.xyz (NOT '*' wildcard)")

# ─── Main ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Cloudflare security hardening for gen1e.xyz")
    parser.add_argument("--token", "-t", help="Cloudflare API token")
    parser.add_argument("--zone", "-z", help="Zone ID for gen1e.xyz")
    parser.add_argument("--dry-run", "-d", action="store_true", help="Show what would be done without making changes")
    parser.add_argument("--skip-dns", action="store_true", help="Skip DNS record creation")
    parser.add_argument("--skip-transform", action="store_true", help="Skip Transform Rules")
    parser.add_argument("--skip-waf", action="store_true", help="Skip WAF rules")
    parser.add_argument("--verify-only", "-v", action="store_true", help="Only run verification checks")
    parser.add_argument("--discover", action="store_true", help="Discover zone ID and exit")
    args = parser.parse_args()

    token = args.token or os.environ.get("CLOUDFLARE_API_TOKEN")
    zone_id = args.zone or os.environ.get("CLOUDFLARE_ZONE_ID")

    if not token:
        print("❌ Missing API token. Use --token or set CLOUDFLARE_API_TOKEN env var.")
        print("\n   Create at: https://dash.cloudflare.com/profile/api-tokens")
        print("   Permissions: Zone.DNS=Edit, Zone.Rules=Edit, Zone.Filters=Edit, Zone.Settings=Read")
        sys.exit(1)

    if not zone_id or args.verify_only or args.discover:
        # Auto-discover gen1e.xyz zone ID
        print("🔍 Discovering zone ID for gen1e.xyz...")
        result = cf("GET", "/zones?name=gen1e.xyz", token)
        if result and result.get("success") and result.get("result"):
            found = result["result"][0]
            zone_id = found["id"]
            print(f"   ✅ Zone: {found['name']} (id: {zone_id})")
            print(f"      Plan: {found.get('plan', {}).get('name', 'unknown')}")
            print(f"      Status: {found.get('status', 'unknown')}")
            if args.discover:
                print(f"\n   Zone ID: {zone_id}")
                return
        else:
            if not args.zone:
                print("❌ Could not auto-discover zone. Use --zone to provide it manually.")
                print("   Get from: Cloudflare Dashboard → gen1e.xyz → Overview → Zone ID")
                sys.exit(1)

    print(f"🔒 Cloudflare Security Hardening — gen1e.xyz")
    print(f"   Zone: {zone_id}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")

    if args.verify_only:
        verify_ssl(token, zone_id)
        verify_all(token, zone_id)
        return

    if not args.skip_dns:
        setup_dns(token, zone_id, args.dry_run)

    if not args.skip_transform:
        setup_transform_rules(token, zone_id, args.dry_run)

    if not args.skip_waf:
        setup_waf_rules(token, zone_id, args.dry_run)

    verify_ssl(token, zone_id)
    verify_all(token, zone_id)

    print(f"\n{'='*60}")
    print(f"  Done! Changes may take 1-5 minutes to propagate.")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
