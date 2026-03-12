"""
supabase_cli.py — Main Click CLI entry point for CLI-Anything: Supabase.

Entry point: cli-anything-supabase

Usage:
    cli-anything-supabase --help
    cli-anything-supabase project list --json
    cli-anything-supabase db push --dry-run --json
    cli-anything-supabase migration list --json
    cli-anything-supabase inspect tables --json
    cli-anything-supabase repl
"""

from __future__ import annotations

import json
import sys

import click

from cli_anything.supabase.core.db import db_group
from cli_anything.supabase.core.functions import functions_group
from cli_anything.supabase.core.inspect import inspect_group
from cli_anything.supabase.core.migration import migration_group
from cli_anything.supabase.core.project import project_group

__version__ = "1.0.0"


@click.group()
@click.version_option(__version__, prog_name="cli-anything-supabase")
@click.option(
    "--workdir",
    default=None,
    envvar="SUPABASE_WORKDIR",
    help="Supabase project directory (env: SUPABASE_WORKDIR)",
)
@click.pass_context
def cli(ctx: click.Context, workdir: str):
    """CLI-Anything: Supabase — Agent-friendly Supabase CLI harness.

    Wraps the Supabase CLI with structured JSON output, REPL mode,
    and clean command groups for LLM/agent consumption.

    Set SUPABASE_WORKDIR to avoid repeating --workdir on every command.
    """
    ctx.ensure_object(dict)
    ctx.obj["workdir"] = workdir


# Register command groups
cli.add_command(project_group)
cli.add_command(db_group)
cli.add_command(migration_group)
cli.add_command(functions_group)
cli.add_command(inspect_group)


@cli.command("status")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def status_cmd(workdir: str, as_json: bool):
    """Show overall project health (local containers + session state)."""
    import os
    from cli_anything.supabase.utils.supabase_backend import run_supabase
    from cli_anything.supabase.core.project import _load_session

    cwd = workdir or os.getcwd()
    result = run_supabase(["status", "--output", "json"], cwd=cwd)
    session = _load_session()

    if as_json:
        payload = {
            "success": result.success,
            "command": "status",
            "returncode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "data": result.parsed(),
            "session": session,
        }
        click.echo(json.dumps(payload, indent=2))
    else:
        if session:
            click.echo(f"Active project: {session.get('project_ref', 'none')}")
            click.echo(f"Workdir: {session.get('workdir', cwd)}")
        else:
            click.echo("No active session.")
        click.echo()
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)


@cli.command("repl")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--json", "json_mode", is_flag=True, help="Start REPL in JSON mode")
@click.option(
    "--history",
    default="~/.cli-anything-supabase-history",
    help="Path to REPL history file",
)
def repl_cmd(workdir: str, json_mode: bool, history: str):
    """Launch an interactive REPL for Supabase commands."""
    from cli_anything.supabase.utils.repl_skin import run_repl

    run_repl(workdir=workdir, json_mode=json_mode, history_path=history)


@cli.command("version")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def version_cmd(as_json: bool):
    """Show CLI-Anything harness version and underlying supabase version."""
    from cli_anything.supabase.utils.supabase_backend import run_supabase, find_supabase

    try:
        binary = find_supabase()
        result = run_supabase(["--version"])
        supabase_ver = result.stdout or result.stderr
    except RuntimeError as e:
        binary = "not found"
        supabase_ver = str(e)

    if as_json:
        click.echo(
            json.dumps(
                {
                    "harness_version": __version__,
                    "supabase_binary": binary,
                    "supabase_version": supabase_ver,
                },
                indent=2,
            )
        )
    else:
        click.echo(f"cli-anything-supabase  v{__version__}")
        click.echo(f"supabase binary        {binary}")
        click.echo(f"supabase version       {supabase_ver}")


if __name__ == "__main__":
    cli()
