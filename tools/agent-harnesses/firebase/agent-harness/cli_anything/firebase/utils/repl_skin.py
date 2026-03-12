"""
repl_skin.py — Interactive REPL for the Firebase CLI harness.

Provides a prompt-toolkit-based REPL with:
  - Active project shown in prompt: firebase[tech-genie-prod]>
  - Tab completion for top-level subcommands
  - Session state stored in ~/.cli-anything/firebase/session.json
  - 'help', 'quit', 'exit' built-in commands
"""

from __future__ import annotations

import json
import os
import shlex
import sys
from pathlib import Path
from typing import Optional

from ..utils.firebase_backend import find_firebase, resolve_project, run_firebase

SESSION_DIR = Path.home() / ".cli-anything" / "firebase"
SESSION_FILE = SESSION_DIR / "session.json"

BANNER = """
╔═══════════════════════════════════════════╗
║   CLI-Anything: Firebase Agent REPL       ║
║   Type 'help' for commands, 'quit' to exit║
╚═══════════════════════════════════════════╝
"""

BUILTIN_COMMANDS = {
    "help": "Show this help message",
    "quit": "Exit the REPL",
    "exit": "Exit the REPL",
    "project": "Show or set the active project: project [PROJECT_ID]",
    "version": "Show firebase CLI version",
}

FIREBASE_SUBCOMMANDS = [
    "deploy",
    "hosting:channel:list",
    "hosting:channel:create",
    "hosting:channel:deploy",
    "hosting:channel:delete",
    "hosting:channel:clone",
    "functions:list",
    "functions:log",
    "functions:delete",
    "functions:config:get",
    "functions:config:set",
    "firestore:indexes",
    "firestore:delete",
    "projects:list",
    "projects:create",
    "apps:list",
    "apps:create",
    "apps:sdkconfig",
    "emulators:start",
    "emulators:export",
    "use",
]


def load_session() -> dict:
    """Load persisted session state."""
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def save_session(state: dict) -> None:
    """Persist session state to disk."""
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(state, indent=2))


def get_prompt(project: Optional[str]) -> str:
    label = project or "no-project"
    return f"firebase[{label}]> "


def run_repl(initial_project: Optional[str] = None, cwd: Optional[str] = None) -> None:
    """Run the Firebase interactive REPL."""
    # Attempt to use prompt_toolkit for a nicer experience
    try:
        from prompt_toolkit import PromptSession
        from prompt_toolkit.completion import WordCompleter
        from prompt_toolkit.history import FileHistory

        history_file = SESSION_DIR / ".history"
        SESSION_DIR.mkdir(parents=True, exist_ok=True)
        session = PromptSession(
            history=FileHistory(str(history_file)),
            completer=WordCompleter(
                list(BUILTIN_COMMANDS.keys()) + FIREBASE_SUBCOMMANDS,
                ignore_case=True,
            ),
        )

        def prompt_fn(p: str) -> str:
            return session.prompt(p)

    except ImportError:
        # Fallback to plain input()
        def prompt_fn(p: str) -> str:  # type: ignore[misc]
            return input(p)

    # Load or init state
    state = load_session()
    active_project = initial_project or state.get("project") or resolve_project(cwd=cwd)

    print(BANNER)
    if active_project:
        print(f"  Active project: {active_project}")
    else:
        print("  No active project. Set one with: project <PROJECT_ID>")
    print()

    while True:
        try:
            raw = prompt_fn(get_prompt(active_project)).strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not raw:
            continue

        parts = shlex.split(raw)
        cmd = parts[0].lower()

        # Built-in commands
        if cmd in ("quit", "exit"):
            print("Bye!")
            break

        if cmd == "help":
            print("\nBuilt-in commands:")
            for name, desc in BUILTIN_COMMANDS.items():
                print(f"  {name:<12}  {desc}")
            print("\nFirebase subcommands (passed directly to firebase CLI):")
            for sub in FIREBASE_SUBCOMMANDS:
                print(f"  {sub}")
            print()
            continue

        if cmd == "version":
            result = run_firebase(["--version"], project=None, cwd=cwd, json_output=False)
            print(result.stdout or result.stderr)
            continue

        if cmd == "project":
            if len(parts) > 1:
                active_project = parts[1]
                state["project"] = active_project
                save_session(state)
                print(f"  Active project set to: {active_project}")
            else:
                print(f"  Active project: {active_project or '(none)'}")
            continue

        # Pass everything else directly to firebase CLI
        try:
            result = run_firebase(parts, project=active_project, cwd=cwd)
            if result.stdout:
                print(result.stdout)
            if result.stderr:
                # Firebase often prints info to stderr even on success
                print(result.stderr, file=sys.stderr)
            if not result.success:
                print(f"  [exit code {result.returncode}]", file=sys.stderr)
        except FileNotFoundError as e:
            print(f"  Error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"  Unexpected error: {e}", file=sys.stderr)
