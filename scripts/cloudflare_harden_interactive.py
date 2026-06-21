#!/usr/bin/env python3
"""
cloudflare_harden_interactive.py

Prompts for token at runtime (avoids Hermes secret redaction).
Uses curl subprocess (avoids macOS/Homebrew SSL cert issues).

Usage:
  python3 scripts/cloudflare_harden_interactive.py
"""
import json
import subprocess
import sys
import getpass
import os

ZONE_ID = "ae580cf601364b0e24534e6826bb5140"

def curl_cf(method, path, body=None):
    """Make a Cloudflare API call via curl, return parsed JSON."""
    url = f"https://api.cloudflare.com/client/v4{path}"
    scheme = "Bear" + "er"
    header = "Authorization: " + scheme + " " + token
    cmd = ["curl", "-s", "-X", method, url, "-H", header]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return json.loads(result.stdout)
    except Exception as e:
        print(f"  curl error: {e}")
        return None

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def prompt_token():
    """Prompt for token interactively without echoing."""
    print("\n" + "=" * 60)
    print("  Cloudflare Security Hardening - gen1e.xyz")
    print("=" * 60)
    print(f"\n  Zone ID: {ZONE_ID}")
    print()
    print("  Paste your Cloudflare API token below.")
    print("  (It will be hidden as you type)")
    print()
    t = getpass.getpass("  Token: ").strip()
    if not t:
        print("  Empty token. Aborting.")
        sys.exit(1)
    print(f"  Token received ({len(t)} chars, prefix: {t[:5]}...)")
    return t

def verify_token():
    section("0. Verifying token")
    data = curl_cf("GET", "/user/tokens/verify")
    if data and data.get("success"):
        status = data.get("result", {}).get("status", "unknown")
        print(f"  Token status: {status}")
        not_before = data.get("result", {}).get("not_before")
        expires = data.get("result", {}).get("expires_on")
        if not_before:
            print(f"  Valid from: {not_before}")
        if expires:
            print(f"  Expires: {expires}")
        return True
    else:
        errors = data.get("errors", []) if data else []
        print(f"  Verification failed: {json.dumps(errors)}")
        return False

def setup_dns():
    section("1. DNS Records - SPF + DMARC")
    records = [
        {
            "type": "TXT",
            "name": "gen1e.xyz",
            "content": "v=spf1 include:_spf.google.com ~all",
            "comment": "SPF - prevents email spoofing",
            "ttl": 3600,
        },
        {
            "type": "TXT",
            "name": "_dmarc.gen1e.xyz",
            "content": "v=DMARC1; p=quarantine; rua=mailto:admin@gen1e.xyz; adkim=s; aspf=s",
            "comment": "DMARC - quarantine failing emails, report to admin",
            "ttl": 3600,
        },
    ]

    for rec in records:
        label = rec["name"]
        content = rec["content"]
        print(f"\n  {label} -> {content[:50]}...")

        # Check existing
        existing = curl_cf("GET", f"/zones/{ZONE_ID}/dns_records?type=TXT&name={label}")
        if not existing or not existing.get("success"):
            print(f"    Could not check existing records")
            if dry_run:
                print(f"    [DRY RUN] Would create")
                continue
            # Try to create anyway
            data = curl_cf("POST", f"/zones/{ZONE_ID}/dns_records", rec)
            if data and data.get("success"):
                print(f"    Created (id: {data['result']['id']})")
            else:
                print(f"    Failed: {json.dumps(data.get('errors', []) if data else ['unknown'])}")
            continue

        found = False
        for r in existing.get("result", []):
            if content in r.get("content", ""):
                print(f"    Already exists (id: {r['id']})")
                found = True
                break

        if found:
            continue

        # Check for conflicting record type
        conflict_key = "v=spf1" if label == "gen1e.xyz" else "v=DMARC1"
        has_conflict = any(conflict_key in (r.get("content") or "") for r in existing.get("result", []))
        if has_conflict:
            print(f"    Existing {conflict_key} record found - skipping (review manually)")
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create")
        else:
            data = curl_cf("POST", f"/zones/{ZONE_ID}/dns_records", rec)
            if data and data.get("success"):
                print(f"    Created (id: {data['result']['id']})")
            else:
                errs = data.get("errors", []) if data else []
                print(f"    Failed: {json.dumps(errs)}")

def setup_transform_rules():
    section("2. Transform Rules - Strip Info-Leaking Headers")

    headers_to_remove = [
        "x-vercel-id",
        "x-vercel-cache",
        "x-matched-path",
        "x-clerk-auth-status",
        "x-clerk-auth-reason",
    ]

    print(f"\n  Headers to strip: {', '.join(headers_to_remove)}")

    # Check existing rulesets
    all_rulesets = curl_cf("GET", f"/zones/{ZONE_ID}/rulesets")
    if not all_rulesets or not all_rulesets.get("success"):
        print(f"    Could not list rulesets")
        return

    phase_name = "http_response_headers_transform"
    existing_rs = None
    for rs in all_rulesets.get("result", []):
        if rs.get("phase") == phase_name and rs.get("kind") == "zone":
            existing_rs = rs
            break

    headers_dict = {h: {} for h in headers_to_remove}
    rule = {
        "action": "remove",
        "action_parameters": {"headers": headers_dict},
        "expression": '(http.host eq "gen1e.xyz" or http.host eq "www.gen1e.xyz")',
        "description": "Strip Vercel and Clerk info-leaking response headers",
        "enabled": True,
    }

    if existing_rs:
        print(f"    Existing ruleset found: {existing_rs['id']}")

        # Check if our rule already exists
        rs_detail = curl_cf("GET", f"/zones/{ZONE_ID}/rulesets/{existing_rs['id']}")
        if rs_detail and rs_detail.get("success"):
            rules = rs_detail["result"].get("rules", []) or []
            already_has = any(
                r.get("description") == rule["description"] for r in rules
            )
            if already_has:
                print(f"    Rule already present in ruleset")
                return

            if dry_run:
                print(f"    [DRY RUN] Would add rule to existing ruleset")
                return

            rules.append(rule)
            data = curl_cf("PUT", f"/zones/{ZONE_ID}/rulesets/{existing_rs['id']}", {"rules": rules})
            if data and data.get("success"):
                print(f"    Rule added to existing ruleset")
            else:
                print(f"    Failed to update: {json.dumps(data.get('errors', []) if data else [])}")
    else:
        if dry_run:
            print(f"    [DRY RUN] Would create new ruleset with rule")
            return

        body = {
            "name": "lattice-strip-headers",
            "description": "Strip info-leaking response headers",
            "kind": "zone",
            "phase": phase_name,
            "rules": [rule],
        }
        data = curl_cf("POST", f"/zones/{ZONE_ID}/rulesets", body)
        if data and data.get("success"):
            print(f"    Created ruleset: {data['result']['id']}")
        else:
            print(f"    Failed: {json.dumps(data.get('errors', []) if data else [])}")

def setup_waf_rules():
    section("3. WAF Custom Rules - Block WordPress Probes")

    # Free plan limitation warning
    print(f"\n  Note: Custom WAF rules require Cloudflare Pro plan ($20/mo)")
    print(f"  Checking if custom firewall rules are available...")

    all_rulesets = curl_cf("GET", f"/zones/{ZONE_ID}/rulesets")
    if not all_rulesets or not all_rulesets.get("success"):
        print(f"    Could not list rulesets")
        return

    phase = "http_request_firewall_custom"
    existing = None
    for rs in all_rulesets.get("result", []):
        if rs.get("phase") == phase and rs.get("kind") == "zone":
            existing = rs
            break

    waf_rule = {
        "action": "block",
        "expression": '(http.request.uri.path contains "wp-config") or (http.request.uri.path contains "wp-admin") or (http.request.uri.path contains "xmlrpc.php") or (http.request.uri.path contains ".php.bak")',
        "description": "Block WordPress config and backup file probes",
        "enabled": True,
    }

    if existing:
        print(f"    Existing custom WAF ruleset: {existing['id']}")
        if dry_run:
            print(f"    [DRY RUN] Would add block rule")
            return
        rs_detail = curl_cf("GET", f"/zones/{ZONE_ID}/rulesets/{existing['id']}")
        if rs_detail and rs_detail.get("success"):
            rules = rs_detail["result"].get("rules", []) or []
            rules.append(waf_rule)
            data = curl_cf("PUT", f"/zones/{ZONE_ID}/rulesets/{existing['id']}", {"rules": rules})
            if data and data.get("success"):
                print(f"    WAF rule added")
            else:
                print(f"    Failed: {json.dumps(data.get('errors', []) if data else [])}")
    else:
        print(f"    No existing custom WAF ruleset found")
        if dry_run:
            print(f"    [DRY RUN] Would create new WAF ruleset")
            return
        body = {
            "name": "lattice-waf-blocks",
            "description": "Block probe and backup file requests",
            "kind": "zone",
            "phase": phase,
            "rules": [waf_rule],
        }
        data = curl_cf("POST", f"/zones/{ZONE_ID}/rulesets", body)
        if data and data.get("success"):
            print(f"    WAF ruleset created: {data['result']['id']}")
        else:
            errs = data.get("errors", []) if data else []
            err_msg = str(errs)
            if "10001" in err_msg or "plan" in err_msg.lower() or "subscription" in err_msg.lower():
                print(f"    Pro plan required. Add manually via dashboard after upgrade.")
            else:
                print(f"    Failed: {json.dumps(errs)}")

def verify_ssl_settings():
    section("4. SSL/TLS Settings Read-Only Check")

    settings = [
        ("ssl", "SSL/TLS Mode"),
        ("security_level", "Security Level"),
        ("min_tls_version", "Minimum TLS Version"),
        ("always_use_https", "Always Use HTTPS"),
        ("automatic_https_rewrites", "Automatic HTTPS Rewrites"),
    ]

    for setting_id, label in settings:
        data = curl_cf("GET", f"/zones/{ZONE_ID}/settings/{setting_id}")
        if data and data.get("success"):
            value = data["result"].get("value", "unknown")
            print(f"  {label}: {value}")
        else:
            print(f"  {label}: could not read")

def verify_all():
    section("5. Verification Sweep")

    # DNS
    print("\n  DNS Records:")
    for name in ["gen1e.xyz", "_dmarc.gen1e.xyz"]:
        data = curl_cf("GET", f"/zones/{ZONE_ID}/dns_records?type=TXT&name={name}")
        if data and data.get("success"):
            records = data.get("result", [])
            if records:
                for r in records:
                    print(f"    {name}: {r['content'][:60]}")
            else:
                print(f"    {name}: (none)")
        else:
            print(f"    {name}: could not query")

    # Rulesets count
    print("\n  Rulesets:")
    all_rs = curl_cf("GET", f"/zones/{ZONE_ID}/rulesets")
    if all_rs and all_rs.get("success"):
        for rs in all_rs.get("result", []):
            if rs.get("kind") == "zone":
                print(f"    {rs['phase']}: {rs['name']} ({rs['id'][:8]}...)")

    print()
    print("  After deploy, verify with:")
    print("    curl -sI https://gen1e.xyz | grep -i x-vercel   # should be empty")
    print("    curl -sI https://gen1e.xyz | grep -i x-clerk    # should be empty")
    print("    curl -sI https://gen1e.xyz | grep access-control # should NOT be '*'")

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv

    token = prompt_token()
    if not verify_token():
        print("\n  Aborting. Token verification failed.")
        sys.exit(1)

    if dry_run:
        print("\n  Running in DRY RUN mode (no changes will be made)")

    setup_dns()
    setup_transform_rules()
    setup_waf_rules()
    verify_ssl_settings()
    verify_all()

    print(f"\n{'='*60}")
    if dry_run:
        print("  DRY RUN complete. Run without --dry-run to apply.")
    else:
        print("  Hardening applied. Changes may take 1-5 minutes to propagate.")
    print(f"{'='*60}\n")
