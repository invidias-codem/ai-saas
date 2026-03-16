"""
emulators.py — Firebase Emulators command group.

Wraps: firebase emulators:* commands
"""

from __future__ import annotations

import json as _json

import click

from ..utils.firebase_backend import run_firebase


@click.group("emulators")
def emulators_group() -> None:
    """Manage Firebase local emulators."""


@emulators_group.command("start")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--only", default=None, help="Comma-separated emulators to start (e.g. firestore,functions).")
@click.option("--import-dir", default=None, help="Directory to import emulator data from.")
@click.option("--export-on-exit", default=None, help="Directory to export emulator data on exit.")
@click.option("--inspect-functions", default=None, help="Enable inspector on functions at port (default 9229).")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def emulators_start(
    ctx: click.Context,
    project: str,
    only: str,
    import_dir: str,
    export_on_exit: str,
    inspect_functions: str,
    cwd: str,
) -> None:
    """Start the Firebase local emulators.

    Config-driven: reads firebase.json for enabled emulators.
    """
    args = ["emulators:start"]
    if only:
        args += ["--only", only]
    if import_dir:
        args += ["--import", import_dir]
    if export_on_exit:
        args += ["--export-on-exit", export_on_exit]
    if inspect_functions:
        args += ["--inspect-functions", inspect_functions]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@emulators_group.command("export")
@click.argument("path")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--force", "-f", is_flag=True, help="Overwrite existing data in the export directory.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def emulators_export(ctx: click.Context, path: str, project: str, force: bool, cwd: str) -> None:
    """Export data from running emulators to PATH."""
    args = ["emulators:export", path]
    if force:
        args.append("--force")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@emulators_group.command("exec")
@click.argument("script")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--only", default=None, help="Comma-separated emulators to start.")
@click.option("--import-dir", default=None, help="Import emulator data from directory.")
@click.option("--export-on-exit", default=None, help="Export emulator data on exit to directory.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def emulators_exec(
    ctx: click.Context,
    script: str,
    project: str,
    only: str,
    import_dir: str,
    export_on_exit: str,
    cwd: str,
) -> None:
    """Start emulators, run SCRIPT, then shut them down."""
    args = ["emulators:exec", script]
    if only:
        args += ["--only", only]
    if import_dir:
        args += ["--import", import_dir]
    if export_on_exit:
        args += ["--export-on-exit", export_on_exit]
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
