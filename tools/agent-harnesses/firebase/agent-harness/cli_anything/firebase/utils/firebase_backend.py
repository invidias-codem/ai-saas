"""
firebase_backend.py — Low-level wrapper around the Firebase CLI binary.

Security rules:
  - NEVER use shell=True
  - Always pass args as a list: subprocess.run([binary, arg1, arg2], ...)
  - Binary resolved via shutil.which, with known-path fallback
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional

__all__ = ["find_firebase", "run_firebase", "FirebaseResult", "read_firebaserc"]

KNOWN_FIREBASE_PATH = "/Users/jroot/.nvm/versions/node/v22.12.0/bin/firebase"

_INSTALL_INSTRUCTIONS = """
Firebase CLI not found. Install it with:

  npm install -g firebase-tools

Or ensure the binary is on your PATH.
"""


def find_firebase() -> str:
    """Return the absolute path to the firebase binary.

    Resolution order:
      1. shutil.which('firebase') — respects PATH
      2. KNOWN_FIREBASE_PATH fallback

    Raises:
        RuntimeError: if the binary cannot be found.
    """
    binary = shutil.which("firebase")
    if binary:
        return binary
    if os.path.isfile(KNOWN_FIREBASE_PATH) and os.access(KNOWN_FIREBASE_PATH, os.X_OK):
        return KNOWN_FIREBASE_PATH
    raise RuntimeError(_INSTALL_INSTRUCTIONS)


def read_firebaserc(cwd: Optional[str] = None) -> Optional[str]:
    """Read the active project from .firebaserc in cwd (or current dir).

    Returns the default project alias or None if not found.
    """
    search_dir = Path(cwd) if cwd else Path.cwd()
    firebaserc = search_dir / ".firebaserc"
    if not firebaserc.exists():
        return None
    try:
        data = json.loads(firebaserc.read_text())
        projects = data.get("projects", {})
        return projects.get("default") or next(iter(projects.values()), None)
    except (json.JSONDecodeError, StopIteration):
        return None


def resolve_project(project: Optional[str] = None, cwd: Optional[str] = None) -> Optional[str]:
    """Resolve the active Firebase project ID.

    Priority:
      1. Explicit ``project`` argument
      2. ``FIREBASE_PROJECT`` environment variable
      3. ``.firebaserc`` default alias in cwd
    """
    if project:
        return project
    env_project = os.environ.get("FIREBASE_PROJECT")
    if env_project:
        return env_project
    return read_firebaserc(cwd)


class FirebaseResult:
    """Structured result from a Firebase CLI invocation."""

    def __init__(
        self,
        args: list[str],
        returncode: int,
        stdout: str,
        stderr: str,
    ) -> None:
        self.args = args
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        self._parsed: Optional[Any] = None
        self._parse_attempted = False

    @property
    def success(self) -> bool:
        return self.returncode == 0

    @property
    def command(self) -> str:
        """Return subcommand string (without binary name)."""
        return " ".join(self.args[1:]) if len(self.args) > 1 else ""

    def parsed(self) -> Optional[Any]:
        """Try to parse stdout as JSON. Returns None if not parseable."""
        if not self._parse_attempted:
            self._parse_attempted = True
            try:
                self._parsed = json.loads(self.stdout)
            except (json.JSONDecodeError, ValueError):
                self._parsed = None
        return self._parsed

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "command": self.command,
            "returncode": self.returncode,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "data": self.parsed(),
        }

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"FirebaseResult(command={self.command!r}, "
            f"returncode={self.returncode}, "
            f"success={self.success})"
        )


def run_firebase(
    args: list[str],
    project: Optional[str] = None,
    cwd: Optional[str] = None,
    timeout: int = 180,
    env: Optional[dict[str, str]] = None,
    json_output: bool = True,
) -> FirebaseResult:
    """Run the firebase binary with the given argument list.

    Args:
        args:        Argument list *excluding* the binary name.
                     Example: ["deploy", "--only", "hosting"]
        project:     Firebase project ID or alias (inserted as -P flag).
        cwd:         Working directory for the subprocess (defaults to CWD).
        timeout:     Seconds before the process is killed (default 180).
        env:         Additional environment variables to merge in.
        json_output: If True, appends --json flag automatically.

    Returns:
        FirebaseResult with stdout, stderr, returncode, and parsed data.

    Security:
        Never passes shell=True. Binary is always resolved first.
    """
    binary = find_firebase()

    # Resolve project
    resolved_project = resolve_project(project, cwd)

    # Build command list
    cmd = [binary]
    if resolved_project:
        cmd += ["-P", resolved_project]

    # Append --json if requested and not already present
    args_list = list(args)
    if json_output and "--json" not in args_list and "-j" not in args_list:
        args_list.append("--json")

    cmd += [str(a) for a in args_list]

    run_env = os.environ.copy()
    if env:
        run_env.update(env)

    result = subprocess.run(  # noqa: S603  (no shell=True)
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=run_env,
    )

    return FirebaseResult(
        args=cmd,
        returncode=result.returncode,
        stdout=result.stdout.strip(),
        stderr=result.stderr.strip(),
    )
