"""
functions.py — Firebase Functions command group.

Wraps: firebase functions:* commands
"""

from __future__ import annotations

import json as _json

import click

from ..utils.firebase_backend import run_firebase


@click.group("functions")
def functions_group() -> None:
    """Manage Firebase Cloud Functions."""


@functions_group.command("list")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def functions_list(ctx: click.Context, project: str, cwd: str) -> None:
    """List all deployed Cloud Functions."""
    args = ["functions:list"]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@functions_group.command("log")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--only", default=None, help="Comma-separated function names.")
@click.option("--lines", default=35, show_default=True, help="Number of log lines to show.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def functions_log(ctx: click.Context, project: str, only: str, lines: int, cwd: str) -> None:
    """Fetch logs from deployed Cloud Functions."""
    args = ["functions:log", "--lines", str(lines)]
    if only:
        args += ["--only", only]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@functions_group.command("delete")
@click.argument("function_names", nargs=-1, required=True)
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--region", default=None, help="Region of the function (e.g. us-central1).")
@click.option("--force", "-f", is_flag=True, help="Skip confirmation prompt.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def functions_delete(
    ctx: click.Context,
    function_names: tuple[str, ...],
    project: str,
    region: str,
    force: bool,
    cwd: str,
) -> None:
    """Delete one or more deployed Cloud Functions."""
    args = ["functions:delete"] + list(function_names)
    if region:
        args += ["--region", region]
    if force:
        args.append("--force")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@functions_group.command("config-get")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def config_get(ctx: click.Context, project: str, cwd: str) -> None:
    """Fetch the current Cloud Functions configuration."""
    args = ["functions:config:get"]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@functions_group.command("config-set")
@click.argument("entries", nargs=-1, required=True, metavar="KEY=VALUE...")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def config_set(ctx: click.Context, entries: tuple[str, ...], project: str, cwd: str) -> None:
    """Set Cloud Functions configuration values (KEY=VALUE pairs).

    Examples:
      functions config-set stripe.key=sk_live_... sendgrid.key=SG...
    """
    args = ["functions:config:set"] + list(entries)
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@functions_group.command("config-unset")
@click.argument("keys", nargs=-1, required=True, metavar="KEY...")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def config_unset(ctx: click.Context, keys: tuple[str, ...], project: str, cwd: str) -> None:
    """Remove Cloud Functions configuration keys."""
    args = ["functions:config:unset"] + list(keys)
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


def _output(ctx: click.Context, result) -> None:
    if ctx.obj and ctx.obj.get("json"):
        click.echo(_json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr and not result.success:
            click.echo(result.stderr, err=True)
    if not result.success:
        ctx.exit(result.returncode)
