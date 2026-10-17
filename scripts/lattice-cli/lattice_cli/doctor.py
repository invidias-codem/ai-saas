"""Read-only checks; offline mode validates the bundled runtime without Docker."""
import json
import platform
from . import __version__, crypto_license, preflight


def cmd_doctor(args):
    checks = [{"name": "cryptography", "passed": crypto_license.CRYPTO_AVAILABLE}]
    if crypto_license.CRYPTO_AVAILABLE:
        # Exercise the native extension, not merely the Python import.
        try:
            private, public = crypto_license.generate_keypair()
            key = crypto_license.sign_license_payload(private, {"tier": "community"})
            checks[0]["passed"] = crypto_license.verify_license_key(key, public) is not None
        except Exception:
            checks[0]["passed"] = False
    if not args.offline:
        for name, check in [("docker", preflight.check_docker_daemon), ("compose", preflight.check_compose_v2)]:
            passed, detail = check()
            checks.append({"name": name, "passed": passed, "detail": detail})
    result = {"version": __version__, "platform": platform.system(), "architecture": platform.machine(),
              "scope": "runtime" if args.offline else "runtime-and-docker", "checks": checks,
              "passed": all(check["passed"] for check in checks)}
    if args.json:
        print(json.dumps(result))
    else:
        for check in checks:
            print(f"{'PASS' if check['passed'] else 'FAIL'} {check['name']}: {check.get('detail', '')}")
    return 0 if result["passed"] else 1
