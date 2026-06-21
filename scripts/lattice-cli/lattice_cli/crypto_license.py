"""
V3 cryptographic license verification using ed25519 signatures.

License keys now contain a signed payload that cannot be forged
without access to the private key. Even if the compiled binary
is reverse-engineered and the public key extracted, signatures
remain secure (ed25519 is not vulnerable to public-key-only attacks).

License format (V3):
  lattice-v3-<base64-payload>.<base64-signature>

Where:
  - payload = JSON dict with tier, features, expiry, etc.
  - signature = 64-byte ed25519 signature of payload bytes

Verification flow:
  1. Decode payload and signature from license key
  2. Load embedded public key (baked into binary at compile time)
  3. Verify signature matches payload
  4. Check expiry (local clock, no NTP dependency for air-gapped)
  5. Extract tier and features

Requires: cryptography>=41.0 (bundled by Nuitka/PyInstaller)
"""

import base64
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )
    from cryptography.hazmat.primitives import serialization
    from cryptography.exceptions import InvalidSignature

    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    # Stub for type-checking when cryptography not installed
    Ed25519PrivateKey = type("Ed25519PrivateKey", (), {})
    Ed25519PublicKey = type("Ed25519PublicKey", (), {})
    InvalidSignature = Exception


# Embedded public key (PEM format, base64-encoded)
# This is baked into the compiled binary and cannot sign licenses.
# The private key is kept offline and air-gapped by JJEM Global Technology.
#
# To regenerate: python -c "from lattice_cli import crypto_license; crypto_license.cmd_keygen()"
EMBEDDED_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAWI4rQRBRLpJObZ2dGimMIzF1T367Vi+F1Z//OKbYJjU=
-----END PUBLIC KEY-----"""


def check_crypto_available():
    """Ensure cryptography library is installed."""
    if not CRYPTO_AVAILABLE:
        raise ImportError(
            "cryptography library required for V3 licenses.\n"
            "Install: pip install cryptography>=41.0"
        )


def generate_keypair() -> tuple[bytes, bytes]:
    """Generate an ed25519 keypair. Returns (private_key_pem, public_key_pem).

    WARNING: Private key must be stored securely and never committed to git.
    """
    check_crypto_available()

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    return private_pem, public_pem


def sign_license_payload(private_pem: bytes, payload: dict) -> str:
    """Sign a license payload and return a V3 license key string.

    Args:
        private_pem: PEM-encoded ed25519 private key
        payload: dict with license data (tier, features, expiry, etc.)

    Returns:
        License key string: "lattice-v3-<base64-payload>.<base64-signature>"
    """
    check_crypto_available()

    private_key = serialization.load_pem_private_key(private_pem, password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError("Private key must be ed25519")

    # Serialize payload to JSON (sorted keys for deterministic signing)
    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload_bytes = payload_json.encode("utf-8")

    # Sign
    signature = private_key.sign(payload_bytes)

    # Encode to base64 (URL-safe for license key readability)
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("ascii").rstrip("=")
    signature_b64 = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")

    return f"lattice-v3-{payload_b64}.{signature_b64}"


def verify_license_key(license_key: str, public_pem: bytes | None = None) -> dict | None:
    """Verify a V3 license key and return the payload if valid.

    Args:
        license_key: License key string from user
        public_pem: Optional override for embedded public key (for testing)

    Returns:
        Payload dict if signature valid and not expired, else None
    """
    check_crypto_available()

    # Parse license key
    if not license_key.startswith("lattice-v3-"):
        return None

    parts = license_key[len("lattice-v3-"):].split(".", 1)
    if len(parts) != 2:
        return None

    payload_b64, signature_b64 = parts

    # Decode (add padding back if needed)
    try:
        payload_bytes = base64.urlsafe_b64decode(
            payload_b64 + "=" * (-len(payload_b64) % 4)
        )
        signature = base64.urlsafe_b64decode(
            signature_b64 + "=" * (-len(signature_b64) % 4)
        )
    except Exception:
        return None

    # Load public key
    pub_pem = public_pem or EMBEDDED_PUBLIC_KEY.encode("utf-8")
    try:
        public_key = serialization.load_pem_public_key(pub_pem)
    except Exception:
        return None

    if not isinstance(public_key, Ed25519PublicKey):
        return None

    # Verify signature
    try:
        public_key.verify(signature, payload_bytes)
    except InvalidSignature:
        return None

    # Parse payload
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    # Check expiry (if present)
    expires_at = payload.get("expires_at")
    if expires_at:
        try:
            expiry_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            if now > expiry_dt:
                payload["_status"] = "expired"
                return payload
        except (ValueError, TypeError):
            return None

    payload["_status"] = "active"
    return payload


def cmd_keygen(args):
    """Generate a new ed25519 keypair for license signing."""
    print(f"\n  Generating ed25519 keypair ...")
    private_pem, public_pem = generate_keypair()

    private_path = args.private or "lattice-license-private.pem"
    public_path = args.public or "lattice-license-public.pem"

    Path(private_path).write_bytes(private_pem)
    os.chmod(private_path, 0o600)  # Restrict access

    Path(public_path).write_bytes(public_pem)

    print(f"\n  ✓ Keypair generated:")
    print(f"    Private: {private_path} (keep this secret!)")
    print(f"    Public:  {public_path} (embed in binary)")
    print(f"\n  ⚠  Update crypto_license.py with the new public key:")
    print(f"    EMBEDDED_PUBLIC_KEY = \"\"\"{public_pem.decode('ascii')}\"\"\"")
    print(f"\n  ⚠  Store the private key securely (never commit to git).")
    print(f"     Recommended: use a hardware security module (HSM) or offline vault.")

    return 0


def cmd_sign(args):
    """Sign a license payload (for internal use by JJEM Global Technology)."""
    private_path = args.key or "lattice-license-private.pem"
    if not Path(private_path).exists():
        print(f"  ✗ Private key not found: {private_path}")
        print(f"    Generate one: lattice dev keygen")
        return 1

    private_pem = Path(private_path).read_bytes()

    # Build payload
    payload = {
        "tier": args.tier,
        "features": args.features.split(",") if args.features else [],
        "instance_id": args.instance or "default",
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": args.expires,
    }

    # Remove empty optional fields
    payload = {k: v for k, v in payload.items() if v not in ([], "", None)}

    license_key = sign_license_payload(private_pem, payload)

    print(f"\n  License key generated:")
    print(f"\n  {license_key}")
    print(f"\n  Payload:")
    for k, v in sorted(payload.items()):
        print(f"    {k}: {v}")

    if args.output:
        Path(args.output).write_text(license_key + "\n")
        print(f"\n  ✓ Saved to {args.output}")

    return 0


def get_subcommands():
    """Return dev commands (not exposed to end users — only JJEM internal)."""
    return {
        "keygen": {
            "help": "Generate ed25519 keypair for license signing (internal use)",
            "handler": cmd_keygen,
            "args": [
                (("--private",), {"help": "Output path for private key (default: ./lattice-license-private.pem)"}),
                (("--public",), {"help": "Output path for public key (default: ./lattice-license-public.pem)"}),
            ],
        },
        "sign": {
            "help": "Sign a license payload (internal use — requires private key)",
            "handler": cmd_sign,
            "args": [
                (("--key", "-k"), {"help": "Path to private key (default: ./lattice-license-private.pem)"}),
                (("--tier", "-t"), {"required": True, "choices": ["community", "enterprise"], "help": "License tier"}),
                (("--expires", "-e"), {"required": True, "help": "Expiry date (ISO 8601, e.g. 2027-06-21T00:00:00Z)"}),
                (("--instance", "-i"), {"help": "Instance ID"}),
                (("--features", "-f"), {"help": "Comma-separated feature list (optional)"}),
                (("--output", "-o"), {"help": "Output file for license key"}),
            ],
        },
    }
