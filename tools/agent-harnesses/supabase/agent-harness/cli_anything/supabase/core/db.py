"""
core/db.py — Database management commands.

Wraps: supabase db push, pull, reset, diff, dump, lint
"""

from __future__ import annotations

import json
import os
from typing import Optional

import click

from cli_anything.supabase.utils.supabase_backend import run_supabase


@click.group("db")
def db_group():
    """Manage Postgres databases (push, pull, reset, diff, dump, lint)."""


@db_group.command("push")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--dry-run", is_flag=True, help="Print migrations that would be applied, don't apply")
@click.option("--include-all", is_flag=True, help="Include all migrations not on remote history")
@click.option("--include-roles", is_flag=True, help="Include custom roles from supabase/roles.sql")
@click.option("--include-seed", is_flag=True, help="Include seed data from config")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--linked/--local", default=True, help="Push to linked or local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def db_push(
    workdir: Optional[str],
    dry_run: bool,
    include_all: bool,
    include_roles: bool,
    include_seed: bool,
    password: Optional[str],
    linked: bool,
    as_json: bool,
):
    """Push pending migrations to the remote (or local) database."""
    cwd = workdir or os.getcwd()
    args = ["db", "push"]
    if dry_run:
        args.append("--dry-run")
    if include_all:
        args.append("--include-all")
    if include_roles:
        args.append("--include-roles")
    if include_seed:
        args.append("--include-seed")
    if password:
        args += ["--password", password]
    if not linked:
        args.append("--local")

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"db push failed (exit {result.returncode})")


@db_group.command("pull")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("-s", "--schema", multiple=True, help="Schema(s) to include (repeatable)")
@click.option("--local", "use_local", is_flag=True, help="Pull from local database")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def db_pull(
    workdir: Optional[str],
    schema: tuple[str, ...],
    use_local: bool,
    password: Optional[str],
    as_json: bool,
):
    """Pull schema from the remote (or local) database."""
    cwd = workdir or os.getcwd()
    args = ["db", "pull"]
    for s in schema:
        args += ["--schema", s]
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
            raise click.ClickException(f"db pull failed (exit {result.returncode})")


@db_group.command("reset")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--linked", is_flag=True, help="Reset linked project (caution!)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def db_reset(workdir: Optional[str], linked: bool, as_json: bool):
    """Reset the local database to current migrations."""
    cwd = workdir or os.getcwd()
    args = ["db", "reset"]
    if linked:
        args.append("--linked")

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"db reset failed (exit {result.returncode})")


@db_group.command("diff")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("-f", "--file", "output_file", default=None, help="Save diff to a new migration file")
@click.option("-s", "--schema", multiple=True, help="Schema(s) to include")
@click.option("--linked", is_flag=True, help="Diff against linked project (not local)")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def db_diff(
    workdir: Optional[str],
    output_file: Optional[str],
    schema: tuple[str, ...],
    linked: bool,
    as_json: bool,
):
    """Diff local migration files against the local or linked database."""
    cwd = workdir or os.getcwd()
    args = ["db", "diff"]
    if output_file:
        args += ["--file", output_file]
    for s in schema:
        args += ["--schema", s]
    if linked:
        args.append("--linked")

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"db diff failed (exit {result.returncode})")


@db_group.command("dump")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("-f", "--file", "output_file", default=None, help="Output file path")
@click.option("--data-only", is_flag=True, help="Dump data only (no schema)")
@click.option("--role-only", is_flag=True, help="Dump roles only")
@click.option("-s", "--schema", multiple=True, help="Schema(s) to dump")
@click.option("-p", "--password", default=None, help="Postgres password")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def db_dump(
    workdir: Optional[str],
    output_file: Optional[str],
    data_only: bool,
    role_only: bool,
    schema: tuple[str, ...],
    password: Optional[str],
    as_json: bool,
):
    """Dump data or schema from the remote database."""
    cwd = workdir or os.getcwd()
    args = ["db", "dump"]
    if output_file:
        args += ["--file", output_file]
    if data_only:
        args.append("--data-only")
    if role_only:
        args.append("--role-only")
    for s in schema:
        args += ["--schema", s]
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
            raise click.ClickException(f"db dump failed (exit {result.returncode})")


@db_group.command("lint")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("-s", "--schema", multiple=True, help="Schema(s) to lint")
@click.option("--level", type=click.Choice(["warning", "error"]), default=None)
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def db_lint(
    workdir: Optional[str],
    schema: tuple[str, ...],
    level: Optional[str],
    as_json: bool,
):
    """Check local database for typing errors."""
    cwd = workdir or os.getcwd()
    args = ["db", "lint"]
    for s in schema:
        args += ["--schema", s]
    if level:
        args += ["--level", level]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"db lint failed (exit {result.returncode})")
