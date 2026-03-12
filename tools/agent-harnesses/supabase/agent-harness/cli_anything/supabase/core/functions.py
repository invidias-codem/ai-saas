"""
core/functions.py — Supabase Edge Functions commands.

Wraps: supabase functions deploy, list, delete, serve, new, download
"""

from __future__ import annotations

import json
import os
from typing import Optional

import click

from cli_anything.supabase.utils.supabase_backend import run_supabase, run_supabase_json


@click.group("functions")
def functions_group():
    """Manage Supabase Edge Functions (deploy, list, delete, serve, logs)."""


@functions_group.command("deploy")
@click.argument("function_name", required=False)
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--project-ref", default=None, help="Override project ref")
@click.option("--no-verify-jwt", is_flag=True, help="Disable JWT verification for this function")
@click.option("--import-map", default=None, help="Path to import map")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def functions_deploy(
    function_name: Optional[str],
    workdir: Optional[str],
    project_ref: Optional[str],
    no_verify_jwt: bool,
    import_map: Optional[str],
    as_json: bool,
):
    """Deploy FUNCTION_NAME to Supabase (or all functions if omitted)."""
    cwd = workdir or os.getcwd()
    args = ["functions", "deploy"]
    if function_name:
        args.append(function_name)
    if project_ref:
        args += ["--project-ref", project_ref]
    if no_verify_jwt:
        args.append("--no-verify-jwt")
    if import_map:
        args += ["--import-map", import_map]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        data = result.to_dict()
        if function_name:
            data["function_name"] = function_name
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"functions deploy failed (exit {result.returncode})")


@functions_group.command("list")
@click.option("--project-ref", default=None, help="Override project ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def functions_list(project_ref: Optional[str], as_json: bool):
    """List all Edge Functions in Supabase."""
    args = ["functions", "list"]
    if project_ref:
        args += ["--project-ref", project_ref]

    result = run_supabase_json(args)
    if as_json:
        click.echo(json.dumps(result.to_dict(), indent=2))
    else:
        parsed = result.parsed()
        if parsed and isinstance(parsed, list):
            click.echo(f"{'SLUG':<30} {'CREATED AT':<25} {'STATUS'}")
            click.echo("-" * 65)
            for fn in parsed:
                click.echo(
                    f"{fn.get('slug',''):<30} "
                    f"{fn.get('created_at',''):<25} "
                    f"{fn.get('status','')}"
                )
        else:
            if result.stdout:
                click.echo(result.stdout)
            if result.stderr:
                click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"functions list failed (exit {result.returncode})")


@functions_group.command("delete")
@click.argument("function_name")
@click.option("--project-ref", default=None, help="Override project ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def functions_delete(function_name: str, project_ref: Optional[str], as_json: bool):
    """Delete FUNCTION_NAME from Supabase."""
    args = ["functions", "delete", function_name]
    if project_ref:
        args += ["--project-ref", project_ref]

    result = run_supabase(args)
    if as_json:
        data = result.to_dict()
        data["function_name"] = function_name
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"functions delete failed (exit {result.returncode})")


@functions_group.command("serve")
@click.argument("function_name", required=False)
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--no-verify-jwt", is_flag=True, help="Disable JWT verification")
@click.option("--env-file", default=None, help="Path to env file")
@click.option("--import-map", default=None, help="Path to import map")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON (metadata only)")
def functions_serve(
    function_name: Optional[str],
    workdir: Optional[str],
    no_verify_jwt: bool,
    env_file: Optional[str],
    import_map: Optional[str],
    as_json: bool,
):
    """Serve functions locally (interactive; Ctrl-C to stop)."""
    cwd = workdir or os.getcwd()
    args = ["functions", "serve"]
    if function_name:
        args.append(function_name)
    if no_verify_jwt:
        args.append("--no-verify-jwt")
    if env_file:
        args += ["--env-file", env_file]
    if import_map:
        args += ["--import-map", import_map]

    if as_json:
        # JSON mode: just emit the command that would be run, don't actually serve
        click.echo(
            json.dumps(
                {
                    "success": True,
                    "command": "functions serve",
                    "args": args,
                    "note": "Interactive serve not captured in JSON mode; run without --json to start the server.",
                },
                indent=2,
            )
        )
        return

    # Interactive mode — run and stream output to terminal
    import subprocess
    import shutil

    binary = shutil.which("supabase")
    if not binary:
        raise click.ClickException("supabase binary not found")

    try:
        subprocess.run([binary] + args[1:], cwd=cwd)  # noqa: S603
    except KeyboardInterrupt:
        click.echo("\nStopped.")


@functions_group.command("new")
@click.argument("function_name")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def functions_new(function_name: str, workdir: Optional[str], as_json: bool):
    """Create a new Edge Function locally named FUNCTION_NAME."""
    cwd = workdir or os.getcwd()
    result = run_supabase(["functions", "new", function_name], cwd=cwd)
    if as_json:
        data = result.to_dict()
        data["function_name"] = function_name
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"functions new failed (exit {result.returncode})")


@functions_group.command("download")
@click.argument("function_name")
@click.option("--workdir", default=None, help="Supabase project directory")
@click.option("--project-ref", default=None, help="Override project ref")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def functions_download(
    function_name: str,
    workdir: Optional[str],
    project_ref: Optional[str],
    as_json: bool,
):
    """Download FUNCTION_NAME source from Supabase."""
    cwd = workdir or os.getcwd()
    args = ["functions", "download", function_name]
    if project_ref:
        args += ["--project-ref", project_ref]

    result = run_supabase(args, cwd=cwd)
    if as_json:
        data = result.to_dict()
        data["function_name"] = function_name
        click.echo(json.dumps(data, indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        if result.returncode != 0:
            raise click.ClickException(f"functions download failed (exit {result.returncode})")
