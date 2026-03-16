"""
core/inspect.py — Database inspection commands.

Wraps: supabase inspect db table-stats, index-stats, locks, calls,
       outliers, long-running-queries, bloat, blocking, db-stats,
       vacuum-stats
"""

from __future__ import annotations

import json
import os
from typing import Optional

import click

from cli_anything.supabase.utils.supabase_backend import run_supabase


def _inspect_cmd(
    subcommand: str,
    workdir: Optional[str],
    as_json: bool,
    extra_args: Optional[list] = None,
    use_local: bool = False,
) -> None:
    """Shared implementation for inspect db subcommands."""
    cwd = workdir or os.getcwd()
    args = ["inspect", "db", subcommand]
    if use_local:
        args.append("--local")
    if extra_args:
        args.extend(extra_args)

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"inspect db {subcommand} failed (exit {result.returncode})")


@click.group("inspect")
def inspect_group():
    """Inspect database health, stats, and query performance."""


@inspect_group.command("tables")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_tables(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show combined table size, index size, and estimated row count."""
    _inspect_cmd("table-stats", workdir, as_json, use_local=use_local)


@inspect_group.command("indexes")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_indexes(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show combined index size, usage percent, scan counts, and unused status."""
    _inspect_cmd("index-stats", workdir, as_json, use_local=use_local)


@inspect_group.command("locks")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_locks(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show queries which have taken out an exclusive lock on a relation."""
    _inspect_cmd("locks", workdir, as_json, use_local=use_local)


@inspect_group.command("calls")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_calls(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show queries from pg_stat_statements ordered by total times called."""
    _inspect_cmd("calls", workdir, as_json, use_local=use_local)


@inspect_group.command("outliers")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_outliers(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show queries from pg_stat_statements ordered by total execution time."""
    _inspect_cmd("outliers", workdir, as_json, use_local=use_local)


@inspect_group.command("long-running")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_long_running(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show queries running longer than 5 minutes."""
    _inspect_cmd("long-running-queries", workdir, as_json, use_local=use_local)


@inspect_group.command("bloat")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_bloat(workdir: Optional[str], use_local: bool, as_json: bool):
    """Estimate space allocated to relations that are full of dead tuples."""
    _inspect_cmd("bloat", workdir, as_json, use_local=use_local)


@inspect_group.command("blocking")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_blocking(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show queries holding locks and queries waiting to be released."""
    _inspect_cmd("blocking", workdir, as_json, use_local=use_local)


@inspect_group.command("db-stats")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_db_stats(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show cache hit rates, total sizes, and WAL size."""
    _inspect_cmd("db-stats", workdir, as_json, use_local=use_local)


@inspect_group.command("vacuum-stats")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_vacuum_stats(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show vacuum statistics per table."""
    _inspect_cmd("vacuum-stats", workdir, as_json, use_local=use_local)


@inspect_group.command("role-stats")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_role_stats(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show information about roles on the database."""
    _inspect_cmd("role-stats", workdir, as_json, use_local=use_local)


@inspect_group.command("replication-slots")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_replication_slots(workdir: Optional[str], use_local: bool, as_json: bool):
    """Show information about replication slots on the database."""
    _inspect_cmd("replication-slots", workdir, as_json, use_local=use_local)


@inspect_group.command("report")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--local", "use_local", is_flag=True, help="Inspect local database")
@click.option("--output-file", default=None, help="Save report CSV to this path")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def inspect_report(
    workdir: Optional[str],
    use_local: bool,
    output_file: Optional[str],
    as_json: bool,
):
    """Generate a CSV report for all inspect commands."""
    cwd = workdir or os.getcwd()
    args = ["inspect", "report"]
    if use_local:
        args.append("--local")
    if output_file:
        args += ["--output-file", output_file]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"inspect report failed (exit {result.returncode})")
