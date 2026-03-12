"""
core/migration.py — Database migration commands.

Wraps: supabase migration new, list, up, down, repair, squash, fetch
"""

from __future__ import annotations

import json
import os
from typing import Optional

import click

from cli_anything.supabase.utils.supabase_backend import run_supabase, run_supabase_json


@click.group("migration")
def migration_group():
    """Manage database migrations (new, list, up, down, repair, squash)."""


@migration_group.command("new")
@click.argument("name")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_new(name: str, workdir: Optional[str], as_json: bool):
    """Create a new empty migration file named NAME."""
    cwd = workdir or os.getcwd()
    result = run_supabase(["migration", "new", name], cwd=cwd)
    if as_json:
        data = result.to_dict()
        # Extract the created file path from stdout if present
        data["migration_name"] = name
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration new failed (exit {result.returncode})")


@migration_group.command("list")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--linked/--local", default=True, help="List remote or local migrations")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_list(workdir: Optional[str], linked: bool, password: Optional[str], as_json: bool):
    """List local and remote migrations."""
    cwd = workdir or os.getcwd()
    args = ["migration", "list"]
    if not linked:
        args.append("--local")
    if password:
        args += ["--password", password]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration list failed (exit {result.returncode})")


@migration_group.command("up")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Apply to local database")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_up(workdir: Optional[str], use_local: bool, password: Optional[str], as_json: bool):
    """Apply pending migrations to local database."""
    cwd = workdir or os.getcwd()
    args = ["migration", "up"]
    if use_local:
        args.append("--local")
    if password:
        args += ["--password", password]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration up failed (exit {result.returncode})")


@migration_group.command("down")
@click.argument("count", type=int, default=1)
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Apply to local database")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_down(count: int, workdir: Optional[str], use_local: bool, password: Optional[str], as_json: bool):
    """Roll back COUNT migrations (default: 1)."""
    cwd = workdir or os.getcwd()
    args = ["migration", "down", str(count)]
    if use_local:
        args.append("--local")
    if password:
        args += ["--password", password]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        data = result.to_dict()
        data["rolled_back"] = count
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration down failed (exit {result.returncode})")


@migration_group.command("repair")
@click.argument("version")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--status", type=click.Choice(["applied", "reverted"]), default="applied")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_repair(
    version: str,
    workdir: Optional[str],
    status: str,
    password: Optional[str],
    as_json: bool,
):
    """Repair the migration history table for VERSION."""
    cwd = workdir or os.getcwd()
    args = ["migration", "repair", "--status", status, version]
    if password:
        args += ["--password", password]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        data = result.to_dict()
        data["version"] = version
        data["status"] = status
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration repair failed (exit {result.returncode})")


@migration_group.command("squash")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--version", default=None, help="Squash all migrations up to this version")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_squash(
    workdir: Optional[str],
    version: Optional[str],
    password: Optional[str],
    as_json: bool,
):
    """Squash migrations into a single file."""
    cwd = workdir or os.getcwd()
    args = ["migration", "squash"]
    if version:
        args += ["--version", version]
    if password:
        args += ["--password", password]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration squash failed (exit {result.returncode})")


@migration_group.command("fetch")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def migration_fetch(workdir: Optional[str], password: Optional[str], as_json: bool):
    """Fetch migration files from remote history table."""
    cwd = workdir or os.getcwd()
    args = ["migration", "fetch"]
    if password:
        args += ["--password", password]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"migration fetch failed (exit {result.returncode})")
