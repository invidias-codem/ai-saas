#!/usr/bin/env python3
"""
generate_skill.py — CLI-Anything SKILL.md Generator

Generates OpenClaw-compatible SKILL.md files for agent harness directories.
Reads package metadata from setup.py / pyproject.toml and discovers commands
by running `--help` (or falling back to source inspection).

Usage:
    python3 generate_skill.py --harness-dir ./gh/agent-harness
    python3 generate_skill.py --harness-dir ./gh/agent-harness --dry-run

Output:
    <harness-dir>/SKILL.md
"""

from __future__ import annotations

import argparse
import ast
import os
import re
import subprocess
import sys
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Data model ─────────────────────────────────────────────────────────────────

@dataclass
class HarnessInfo:
    """All metadata extracted from a harness directory."""
    # Package metadata
    package_name: str = ""          # e.g. "cli-anything-gh"
    version: str = "1.0.0"
    description: str = ""
    entry_point_module: str = ""    # e.g. "cli_anything.gh.gh_cli"
    binary_name: str = ""           # e.g. "cli-anything-gh"

    # Derived
    skill_name: str = ""            # e.g. "gh-harness"
    platform: str = ""              # e.g. "GitHub CLI (gh)"

    # Discovered commands
    commands: list[dict] = field(default_factory=list)
    top_level_help: str = ""
    global_options: list[str] = field(default_factory=list)

    # JSON flag support
    has_json_flag: bool = False


# ── Metadata extraction ─────────────────────────────────────────────────────────

def _parse_setup_py(path: Path) -> dict:
    """Extract metadata dict from setup.py by parsing the AST."""
    src = path.read_text()
    result = {}
    try:
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                func_name = ""
                if isinstance(func, ast.Name):
                    func_name = func.id
                elif isinstance(func, ast.Attribute):
                    func_name = func.attr
                if func_name == "setup":
                    for kw in node.keywords:
                        if kw.arg and isinstance(kw.value, ast.Constant):
                            result[kw.arg] = kw.value.value
                        # entry_points is a dict
                        elif kw.arg == "entry_points" and isinstance(kw.value, ast.Dict):
                            for k, v in zip(kw.value.keys, kw.value.values):
                                if isinstance(k, ast.Constant) and k.value == "console_scripts":
                                    if isinstance(v, (ast.List, ast.Tuple)):
                                        scripts = []
                                        for elt in v.elts:
                                            if isinstance(elt, ast.Constant):
                                                scripts.append(elt.value)
                                        result["console_scripts"] = scripts
    except SyntaxError:
        pass
    return result


def _parse_pyproject_toml(path: Path) -> dict:
    """Extract metadata from pyproject.toml using stdlib only (no tomllib for 3.10 compat)."""
    src = path.read_text()
    result = {}

    # Simple line-by-line TOML parser for the fields we need
    in_project = False
    in_scripts = False
    console_scripts = []

    for line in src.splitlines():
        stripped = line.strip()
        if stripped == "[project]":
            in_project = True
            in_scripts = False
            continue
        elif stripped == "[project.scripts]":
            in_project = False
            in_scripts = True
            continue
        elif stripped.startswith("["):
            in_project = False
            in_scripts = False
            continue

        if in_project:
            for key in ("name", "version", "description"):
                m = re.match(rf'^{key}\s*=\s*["\'](.+?)["\']', stripped)
                if m:
                    result[key] = m.group(1)

        if in_scripts:
            m = re.match(r'^(\S+)\s*=\s*["\'](.+?)["\']', stripped)
            if m:
                console_scripts.append(f"{m.group(1)} = {m.group(2)}")

    if console_scripts:
        result["console_scripts"] = console_scripts

    return result


def extract_metadata(harness_dir: Path) -> HarnessInfo:
    """Read package metadata from setup.py / pyproject.toml."""
    info = HarnessInfo()
    meta: dict = {}

    pyproject = harness_dir / "pyproject.toml"
    setup_py = harness_dir / "setup.py"

    if pyproject.exists():
        meta = _parse_pyproject_toml(pyproject)
        # Fallback to setup.py for anything missing
        if setup_py.exists():
            fallback = _parse_setup_py(setup_py)
            for k, v in fallback.items():
                if k not in meta:
                    meta[k] = v
    elif setup_py.exists():
        meta = _parse_setup_py(setup_py)

    info.package_name = meta.get("name", "")
    info.version = meta.get("version", "1.0.0")
    info.description = meta.get("description", "")

    # Parse entry point
    scripts = meta.get("console_scripts", [])
    if scripts:
        s = scripts[0]  # e.g. "cli-anything-gh = cli_anything.gh.gh_cli:cli"
        parts = re.split(r"\s*=\s*", s, maxsplit=1)
        if len(parts) == 2:
            info.binary_name = parts[0].strip()
            module_part = parts[1].strip().split(":")[0]
            info.entry_point_module = module_part

    # Derive skill_name: "cli-anything-gh" → "gh-harness"
    name = info.package_name or info.binary_name
    # Strip "cli-anything-" prefix, append "-harness"
    slug = re.sub(r"^cli-anything-", "", name)
    info.skill_name = f"{slug}-harness" if slug else name

    # Derive platform label from package name
    platform_map = {
        "gh": "GitHub CLI (gh)",
        "supabase": "Supabase CLI",
        "firebase": "Firebase CLI",
    }
    info.platform = platform_map.get(slug, slug.title())

    return info


# ── Command discovery ───────────────────────────────────────────────────────────

def _parse_help_output(help_text: str) -> tuple[list[dict], list[str], bool]:
    """
    Parse --help output into (commands, global_options, has_json_flag).
    Returns list of {name, description} dicts.
    """
    commands = []
    global_options = []
    has_json_flag = False

    in_commands = False
    in_options = False

    for line in help_text.splitlines():
        stripped = line.strip()

        # Detect section headers
        if re.match(r'^Commands\s*:?\s*$', stripped, re.IGNORECASE):
            in_commands = True
            in_options = False
            continue
        elif re.match(r'^Options\s*:?\s*$', stripped, re.IGNORECASE):
            in_options = True
            in_commands = False
            continue
        elif stripped.endswith(":") and not stripped.startswith("-"):
            in_commands = False
            in_options = False
            continue

        if not stripped:
            continue

        if in_commands:
            # "  command-name    Description text"
            m = re.match(r'^(\S+)\s{2,}(.+)$', stripped)
            if m:
                commands.append({"name": m.group(1), "description": m.group(2).strip()})
            elif re.match(r'^\S+$', stripped):
                # command with no description
                commands.append({"name": stripped, "description": ""})

        if in_options:
            # Detect --json flag
            if "--json" in stripped:
                has_json_flag = True
            # Collect options that look significant (skip --help, --version)
            m = re.match(r'^(-{1,2}\S+[^,]*),?\s*(-{1,2}\S+)?\s{2,}(.+)$', stripped)
            if m:
                opt_name = m.group(2) or m.group(1)
                if opt_name.strip() not in ("--help", "--version", "-h"):
                    opt_desc = m.group(3).strip()
                    global_options.append(f"`{opt_name.strip()}` — {opt_desc}")
            else:
                # Check if --json appears anywhere in help
                pass

    # Also check for --json anywhere in the raw help
    if "--json" in help_text:
        has_json_flag = True

    return commands, global_options, has_json_flag


def discover_commands(harness_dir: Path, info: HarnessInfo) -> HarnessInfo:
    """Run --help and parse commands. Falls back to source inspection."""
    help_text = ""

    # Strategy 1: Try installed binary
    if info.binary_name:
        try:
            result = subprocess.run(
                [info.binary_name, "--help"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0 or result.stdout:
                help_text = result.stdout or result.stderr
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    # Strategy 2: Run as Python module
    if not help_text and info.entry_point_module:
        try:
            result = subprocess.run(
                [sys.executable, "-m", info.entry_point_module, "--help"],
                capture_output=True, text=True, timeout=10,
                cwd=str(harness_dir),
            )
            if result.stdout:
                help_text = result.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    # Strategy 3: Fallback — inspect source for click groups
    if not help_text:
        help_text = _inspect_source_for_commands(harness_dir, info)

    info.top_level_help = help_text
    commands, global_options, has_json = _parse_help_output(help_text)
    info.commands = commands
    info.global_options = global_options
    info.has_json_flag = has_json

    return info


def _inspect_source_for_commands(harness_dir: Path, info: HarnessInfo) -> str:
    """Inspect Python source to find click command groups as fallback."""
    lines = []
    cli_files = list(harness_dir.rglob("*_cli.py"))
    for cli_file in cli_files:
        try:
            src = cli_file.read_text()
            tree = ast.parse(src)
            for node in ast.walk(tree):
                # Look for cli.add_command(...) calls
                if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
                    call = node.value
                    if isinstance(call.func, ast.Attribute) and call.func.attr == "add_command":
                        if call.args and isinstance(call.args[0], ast.Name):
                            lines.append(f"  {call.args[0].id.replace('_group','').replace('_','-')}     (discovered from source)")
        except Exception:
            pass
    return "Commands:\n" + "\n".join(lines) if lines else ""


# ── SKILL.md generation ─────────────────────────────────────────────────────────

# Output envelope format shown in SKILL.md
OUTPUT_ENVELOPE = """\
```json
{
  "exit_code": 0,
  "stdout": "<raw command output>",
  "stderr": "",
  "json": { ... }   // present when --json is supported
}
```"""


def _build_description(info: HarnessInfo) -> str:
    """Build a concise one-line skill description."""
    if info.description:
        base = info.description.rstrip(".")
    elif info.platform:
        base = f"Agent harness for {info.platform}"
    else:
        base = f"CLI-Anything agent harness ({info.skill_name})"

    # Infer use-when clause from platform
    use_when_map = {
        "GitHub CLI (gh)": (
            "managing GitHub issues, pull requests, workflows, and releases"
        ),
        "Supabase CLI": (
            "managing Supabase projects, databases, migrations, and edge functions"
        ),
        "Firebase CLI": (
            "deploying Firebase apps, managing Firestore, Cloud Functions, and hosting"
        ),
    }
    use_when = use_when_map.get(info.platform, "interacting with " + (info.platform or "the underlying CLI"))

    return (
        f"{base}. Use when {use_when} via a normalized JSON interface "
        f"optimized for LLM and agent consumption."
    )


def _build_command_table(commands: list[dict]) -> str:
    if not commands:
        return "_No commands discovered. Run `--help` manually to explore._\n"
    lines = []
    for cmd in commands:
        name = cmd["name"]
        desc = cmd["description"] or ""
        lines.append(f"| `{name}` | {desc} |")
    header = "| Command | Description |\n|---------|-------------|"
    return header + "\n" + "\n".join(lines)


def _build_global_options(info: HarnessInfo) -> str:
    if not info.global_options:
        return ""
    lines = "\n".join(f"- {o}" for o in info.global_options)
    return f"\n## Global Options\n\n{lines}\n"


def generate_skill_md(info: HarnessInfo, harness_dir: Path) -> str:
    """Render the SKILL.md content."""
    description = _build_description(info)

    # REPL blurb
    has_repl = any(c["name"] == "repl" for c in info.commands)
    repl_section = ""
    if has_repl:
        repl_section = textwrap.dedent(f"""\
            ## Interactive REPL

            Start a persistent session with shared context:

            ```bash
            {info.binary_name} repl
            ```

            Type `help` inside the REPL to see available commands.

        """)

    # JSON flag section
    json_section = ""
    if info.has_json_flag:
        json_section = textwrap.dedent("""\
            ## JSON Output

            Append `--json` to any command for machine-readable output:

            ```bash
            {binary} <command> [subcommand] --json
            ```

            All responses follow this envelope:

            {envelope}

            Parse `stdout` for human-readable output, `json` for structured data.

        """).format(binary=info.binary_name, envelope=OUTPUT_ENVELOPE)
    else:
        json_section = textwrap.dedent("""\
            ## Output Format

            All commands return structured output. The harness normalizes responses
            into a consistent envelope:

            {envelope}

            Parse `exit_code` to detect errors; use `stdout` for display.

        """).format(envelope=OUTPUT_ENVELOPE)

    global_opts = _build_global_options(info)
    command_table = _build_command_table(info.commands)

    # Compose version badge or note
    version_note = f"v{info.version}" if info.version else ""

    content = textwrap.dedent(f"""\
        ---
        name: {info.skill_name}
        description: "{description}"
        risk: safe
        ---

        # {info.skill_name} — CLI-Anything Harness {version_note}

        Agent-friendly wrapper for **{info.platform}** with normalized JSON output,
        REPL mode, and structured command groups optimized for LLM consumption.

        ## Use this skill when

        - You need to interact with {info.platform} programmatically from an agent
        - Performing bulk or multi-step operations that require structured output
        - Running CI/CD automation, issue triage, or database management tasks
        - You want consistent, parseable output without raw CLI noise

        ## Do not use this skill when

        - You need browser-based OAuth flows or GUI interactions
        - The underlying CLI ({info.binary_name.replace("cli-anything-", "")}) is not installed
        - You need real-time streaming output (use the underlying CLI directly)

        ## Binary

        ```bash
        # Invoke as installed binary
        {info.binary_name} [OPTIONS] COMMAND [ARGS...]

        # Or as Python module (if binary not in PATH)
        python3 -m {info.entry_point_module} [OPTIONS] COMMAND [ARGS...]
        ```
        {global_opts}
        ## Commands

        {command_table}

        {json_section}{repl_section}## Safety Rules

        - **Never** pass unsanitized user input directly as shell arguments
        - **Never** use shell expansion (`$()`, backticks) in argument strings
        - Always validate command names against the table above before invoking
        - Use `--json` output for parsing; do not screen-scrape human-readable text
        - Treat sensitive values (tokens, passwords) as opaque — do not log them

        ## Examples

        ```bash
        # Check status and configuration
        {info.binary_name} status

        # Get help for any command group
        {info.binary_name} <command> --help
        ```

        ## Source

        Package: `{info.package_name}` {version_note}
        Entry point module: `{info.entry_point_module}`
        Generated by: [CLI-Anything Skill Generator](../../cli-anything-skill-generator/)
    """)

    return content


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Generate OpenClaw-compatible SKILL.md for a CLI-Anything agent harness.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python3 generate_skill.py --harness-dir ./gh/agent-harness
              python3 generate_skill.py --harness-dir ./supabase/agent-harness --dry-run
        """),
    )
    parser.add_argument(
        "--harness-dir",
        required=True,
        type=Path,
        help="Path to the agent-harness/ directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print generated SKILL.md to stdout without writing to disk",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Custom output path (default: <harness-dir>/SKILL.md)",
    )
    args = parser.parse_args()

    harness_dir = args.harness_dir.resolve()
    if not harness_dir.is_dir():
        print(f"ERROR: --harness-dir does not exist: {harness_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"🔍 Scanning harness directory: {harness_dir}")

    # Step 1: Extract package metadata
    info = extract_metadata(harness_dir)
    if not info.package_name:
        print("  ⚠️  Could not parse package name from setup.py/pyproject.toml — using directory name")
        info.package_name = harness_dir.parent.name
        info.binary_name = f"cli-anything-{harness_dir.parent.name}"
        slug = harness_dir.parent.name
        info.skill_name = f"{slug}-harness"
        info.platform = slug.title()

    print(f"  📦 Package: {info.package_name} v{info.version}")
    print(f"  🎯 Binary:  {info.binary_name}")
    print(f"  🏷️  Skill:   {info.skill_name}")

    # Step 2: Discover commands
    print("  🔎 Discovering commands via --help...")
    info = discover_commands(harness_dir, info)
    print(f"  📋 Found {len(info.commands)} top-level commands: {[c['name'] for c in info.commands]}")

    # Step 3: Generate SKILL.md
    content = generate_skill_md(info, harness_dir)

    if args.dry_run:
        print("\n" + "─" * 60)
        print(content)
        print("─" * 60)
        print("\n✅ Dry run complete — nothing written to disk.")
        return

    # Step 4: Write to disk
    output_path = args.output or (harness_dir / "SKILL.md")
    output_path.write_text(content)
    print(f"  ✅ SKILL.md written → {output_path}")
    print()


if __name__ == "__main__":
    main()
