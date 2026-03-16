"""
core/project.py — Project management commands.

Wraps: supabase init, supabase link, supabase unlink,
       supabase projects list, supabase status
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import click

from cli_anything.supabase.utils.supabase_backend import run_supabase, run_supabase_json

SESSION_FILE = Path.home() / ".cli-anything" / "supabase" / "session.json"


def _load_session() -> dict:
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_session(data: dict) -> None:
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(data, indent=2))


@click.group("project")
def project_group():
    """Manage Supabase projects (init, link, list, status)."""


@project_group.command("init")
@click.option("--workdir", default=None, help="Directory to initialize (default: CWD)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def project_init(workdir: Optional[str], as_json: bool):
    """Initialize a new Supabase project in WORKDIR."""
    cwd = workdir or os.getcwd()
    result = run_supabase(["init"], cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"supabase init failed (exit {result.returncode})")


@project_group.command("link")
@click.argument("project_ref")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def project_link(project_ref: str, workdir: Optional[str], password: Optional[str], as_json: bool):
    """Link to a remote Supabase project by PROJECT_REF."""
    cwd = workdir or os.getcwd()
    args = ["link", "--project-ref", project_ref]
    if password:
        args += ["--password", password]
    result = run_supabase(args, cwd=cwd)

    if result.success:
        session = _load_session()
        session["project_ref"] = project_ref
        session["workdir"] = cwd
        from datetime import datetime, timezone
        session["linked_at"] = datetime.now(timezone.utc).isoformat()
        _save_session(session)

    if as_json:
        data = result.to_dict()
        data["project_ref"] = project_ref
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"supabase link failed (exit {result.returncode})")


@project_group.command("unlink")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def project_unlink(workdir: Optional[str], as_json: bool):
    """Unlink from the current remote Supabase project."""
    cwd = workdir or os.getcwd()
    result = run_supabase(["unlink"], cwd=cwd)

    if result.success:
        session = _load_session()
        session.pop("project_ref", None)
        session.pop("linked_at", None)
        _save_session(session)

    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"supabase unlink failed (exit {result.returncode})")


@project_group.command("list")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def project_list(as_json: bool):
    """List all Supabase projects in your organization."""
    result = run_supabase_json(["projects", "list"])
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        parsed = result.parsed()
        if parsed and isinstance(parsed, list):
            click.echo(f"{'ID':<22} {'NAME':<30} {'REGION':<15} {'STATUS'}")
            click.echo("-" * 75)
            for p in parsed:
                click.echo(
                    f"{p.get('id',''):<22} "
                    f"{p.get('name',''):<30} "
                    f"{p.get('region',''):<15} "
                    f"{p.get('status','')}"
                )
        else:
            if result.stdout:
                click.echo(result.stdout)
            if result.stderr:
                click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"projects list failed (exit {result.returncode})")


@project_group.command("status")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def project_status(workdir: Optional[str], as_json: bool):
    """Show status of local Supabase containers."""
    cwd = workdir or os.getcwd()
    result = run_supabase(["status", "--output", "json"], cwd=cwd)

    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"supabase status failed (exit {result.returncode})")


@project_group.command("session")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def project_session(as_json: bool):
    """Show the current session state (linked project ref, workdir)."""
    session = _load_session()
    if as_json:
        click.echo(json.dumps({"success": True, "session": session}, indent=2))
    else:
        if session:
            click.echo(f"  project_ref : {session.get('project_ref', 'none')}")
            click.echo(f"  workdir     : {session.get('workdir', 'none')}")
            click.echo(f"  linked_at   : {session.get('linked_at', 'never')}")
        else:
            click.echo("No active session. Run: cli-anything-supabase project link <ref>")
