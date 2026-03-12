"""
repl_skin.py — Branded REPL loop for CLI-Anything: Supabase.

Uses prompt_toolkit for history + readline-style editing.
Falls back gracefully if prompt_toolkit is not installed.
"""

from __future__ import annotations

import json
import shlex
import sys
from typing import Optional

from cli_anything.supabase.utils.supabase_backend import find_supabase, run_supabase

BANNER = r"""
╔══════════════════════════════════════════════╗
║   CLI-Anything: Supabase Agent REPL v1.0    ║
║   Supabase CLI harness — agent-friendly     ║
║   Type 'help' for commands, 'quit' to exit  ║
╚══════════════════════════════════════════════╝
"""

PROMPT = "supabase> "

HELP_TEXT = """
Available REPL commands:
  <supabase args>      Run any supabase subcommand (e.g. 'db push --dry-run')
  json on/off          Toggle JSON output mode
  status               Show current session state
  help                 Show this help
  quit / exit / q      Exit the REPL
"""


def _prompt_toolkit_session(history_path: str):
    """Create a prompt_toolkit PromptSession if available."""
    try:
        from prompt_toolkit import PromptSession
        from prompt_toolkit.history import FileHistory

        return PromptSession(history=FileHistory(history_path))
    except ImportError:
        return None


def _get_input(session, prompt: str) -> Optional[str]:
    """Get a line of input from either prompt_toolkit or stdlib input()."""
    if session is not None:
        try:
            return session.prompt(prompt)
        except (KeyboardInterrupt, EOFError):
            return None
    else:
        try:
            return input(prompt)
        except (KeyboardInterrupt, EOFError):
            return None


def run_repl(
    workdir: Optional[str] = None,
    json_mode: bool = False,
    history_path: str = "~/.cli-anything-supabase-history",
) -> None:
    """Launch the interactive REPL."""
    import os

    history_path = os.path.expanduser(history_path)

    # Verify binary is available before entering the loop
    try:
        binary = find_supabase()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    print(BANNER)
    print(f"  Using: {binary}")
    if workdir:
        print(f"  Workdir: {workdir}")
    if json_mode:
        print("  JSON mode: ON")
    print()

    session = _prompt_toolkit_session(history_path)
    _json_mode = json_mode

    while True:
        line = _get_input(session, PROMPT)

        if line is None:
            print("\nGoodbye.")
            break

        line = line.strip()
        if not line:
            continue

        lower = line.lower()

        # Built-in REPL commands
        if lower in ("quit", "exit", "q"):
            print("Goodbye.")
            break

        if lower == "help":
            print(HELP_TEXT)
            continue

        if lower == "json on":
            _json_mode = True
            print("JSON mode: ON")
            continue

        if lower == "json off":
            _json_mode = False
            print("JSON mode: OFF")
            continue

        if lower == "status":
            _print_status(workdir, _json_mode)
            continue

        # Parse the line as a supabase subcommand
        try:
            parts = shlex.split(line)
        except ValueError as e:
            print(f"Parse error: {e}", file=sys.stderr)
            continue

        # Build args; inject --output json if json mode is on
        args = list(parts)
        if _json_mode and "--output" not in args and "-o" not in args:
            args = args + ["--output", "json"]

        result = run_supabase(args, cwd=workdir)

        if _json_mode:
            print(json.dumps(result.to_dict(), indent=2))
        else:
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                print(result.stderr, file=sys.stderr)
            if result.returncode != 0:
                print(f"[exit {result.returncode}]", file=sys.stderr)


def _print_status(workdir: Optional[str], json_mode: bool) -> None:
    """Print current REPL session state."""
    import os

    state = {
        "workdir": workdir or os.getcwd(),
        "json_mode": json_mode,
    }

    # Try to read session file
    session_file = os.path.expanduser("~/.cli-anything/supabase/session.json")
    if os.path.exists(session_file):
        try:
            with open(session_file) as f:
                session_data = json.load(f)
            state["session"] = session_data
        except (json.JSONDecodeError, OSError):
            state["session"] = None
    else:
        state["session"] = None

    if json_mode:
        print(json.dumps(state, indent=2))
    else:
        print(f"  workdir : {state['workdir']}")
        print(f"  json    : {state['json_mode']}")
        if state["session"]:
            print(f"  project : {state['session'].get('project_ref', 'none')}")
        else:
            print("  project : (no session)")
