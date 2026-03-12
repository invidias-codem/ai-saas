"""
supabase_backend.py — Low-level wrapper around the supabase binary.

Security rules:
  - NEVER use shell=True
  - Always pass args as a list: subprocess.run([binary, arg1, arg2], ...)
  - Binary resolved via shutil.which, never hardcoded
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any, Optional

__all__ = ["find_supabase", "run_supabase", "SupabaseResult"]

_INSTALL_INSTRUCTIONS = """
Supabase CLI not found. Install it with one of:

  macOS:   brew install supabase/tap/supabase
  Linux:   https://supabase.com/docs/guides/local-development/cli/getting-started
  npm:     npm install -g supabase
"""


def find_supabase() -> str:
    """Return the absolute path to the supabase binary.

    Raises:
        RuntimeError: if the binary cannot be found on PATH.
    """
    binary = shutil.which("supabase")
    if not binary:
        raise RuntimeError(_INSTALL_INSTRUCTIONS)
    return binary


class SupabaseResult:
    """Structured result from a supabase CLI invocation."""

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
        # Drop the binary name, return the subcommand string
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
            f"SupabaseResult(command={self.command!r}, "
            f"returncode={self.returncode}, "
            f"success={self.success})"
        )


def run_supabase(
    args: list[str],
    cwd: Optional[str] = None,
    timeout: int = 120,
    env: Optional[dict[str, str]] = None,
) -> SupabaseResult:
    """Run the supabase binary with the given argument list.

    Args:
        args:    Argument list *excluding* the binary name.
                 Example: ["db", "push", "--dry-run"]
        cwd:     Working directory for the subprocess (defaults to CWD).
        timeout: Seconds before the process is killed (default 120).
        env:     Additional environment variables to merge in.

    Returns:
        SupabaseResult with stdout, stderr, returncode, and parsed data.

    Security:
        Never passes shell=True. Binary is always resolved first.
    """
    binary = find_supabase()
    cmd = [binary] + [str(a) for a in args]

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

    return SupabaseResult(
        args=cmd,
        returncode=result.returncode,
        stdout=result.stdout.strip(),
        stderr=result.stderr.strip(),
    )


def run_supabase_json(
    args: list[str],
    cwd: Optional[str] = None,
    timeout: int = 120,
    env: Optional[dict[str, str]] = None,
) -> SupabaseResult:
    """Run supabase with --output json appended (if not already present)."""
    if "--output" not in args and "-o" not in args:
        args = list(args) + ["--output", "json"]
    return run_supabase(args, cwd=cwd, timeout=timeout, env=env)
