"""
firebase_cli.py — CLI-Anything agent harness for the Firebase CLI.

Entry point: cli-anything-firebase

Commands:
  deploy   — full deploy, hosting-only, functions-only, preview channels
  hosting  — channel list, create, deploy, delete, clone
  functions — list, log, delete, config-get, config-set
  firestore — indexes, rules, export, import, delete
  projects  — list, create, use, info
  emulators — start, export, exec (config-driven)
  apps      — list, create, sdkconfig
  repl      — interactive REPL with project in prompt
  version   — print firebase CLI version
  raw       — run an arbitrary firebase command
"""

from __future__ import annotations

import json as _json
import sys
from typing import Optional

import click

from .core.apps import apps_group
from .core.deploy import deploy_group
from .core.emulators import emulators_group
from .core.firestore import firestore_group
from .core.functions import functions_group
from .core.hosting import hosting_group
from .core.projects import projects_group
from .utils.firebase_backend import find_firebase, resolve_project, run_firebase


@click.group()
@click.option(
    "--json",
    "json_output",
    is_flag=True,
    default=False,
    help="Output JSON instead of text (machine-readable).",
)
@click.option(
    "--project",
    "-P",
    default=None,
    envvar="FIREBASE_PROJECT",
    help="Firebase project ID or alias (overrides .firebaserc).",
)
@click.pass_context
def cli(ctx: click.Context, json_output: bool, project: Optional[str]) -> None:
    """CLI-Anything: Firebase CLI agent harness.

    Wraps the Firebase CLI (v15.9.1) with structured JSON output,
    a project-aware REPL, and pip-installable entry point.

    Set default project via:
      export FIREBASE_PROJECT=my-project-id
      or via .firebaserc in your working directory.
    """
    ctx.ensure_object(dict)
    ctx.obj["json"] = json_output
    ctx.obj["project"] = project


# Register command groups
cli.add_command(deploy_group)
cli.add_command(hosting_group)
cli.add_command(functions_group)
cli.add_command(firestore_group)
cli.add_command(projects_group)
cli.add_command(emulators_group)
cli.add_command(apps_group)


@cli.command("version")
@click.pass_context
def version(ctx: click.Context) -> None:
    """Print the Firebase CLI version."""
    result = run_firebase(["--version"], json_output=False)
    if ctx.obj.get("json"):
        click.echo(_json.dumps({"version": result.stdout.strip(), "success": result.success}))
    else:
        click.echo(result.stdout or result.stderr)


@cli.command("raw")
@click.argument("args", nargs=-1, required=True)
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--no-json", is_flag=True, help="Do not append --json flag.")
@click.option("--cwd", default=None, help="Working directory.")
@click.pass_context
def raw(ctx: click.Context, args: tuple[str, ...], project: Optional[str], no_json: bool, cwd: Optional[str]) -> None:
    """Run an arbitrary firebase command.

    Example:
      cli-anything-firebase raw hosting:channel:list --site my-site
    """
    resolved = project or ctx.obj.get("project")
    result = run_firebase(list(args), project=resolved, cwd=cwd, json_output=not no_json)
    if ctx.obj.get("json"):
        click.echo(_json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
    if not result.success:
        sys.exit(result.returncode)


@cli.command("repl")
@click.option("--project", "-P", default=None, help="Initial active project.")
@click.option("--cwd", default=None, help="Working directory for firebase commands.")
@click.pass_context
def repl(ctx: click.Context, project: Optional[str], cwd: Optional[str]) -> None:
    """Launch the interactive Firebase REPL.

    The prompt shows the active project:

      firebase[tech-genie-prod]> projects list
      firebase[tech-genie-prod]> deploy hosting
    """
    from .utils.repl_skin import run_repl

    resolved = project or ctx.obj.get("project") or resolve_project(cwd=cwd)
    run_repl(initial_project=resolved, cwd=cwd)


@cli.command("status")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, help="Working directory.")
@click.pass_context
def status(ctx: click.Context, project: Optional[str], cwd: Optional[str]) -> None:
    """Show active project and Firebase CLI status."""
    resolved = project or ctx.obj.get("project") or resolve_project(cwd=cwd)
    try:
        binary = find_firebase()
        ver_result = run_firebase(["--version"], json_output=False)
        version_str = ver_result.stdout.strip()
    except RuntimeError as e:
        if ctx.obj.get("json"):
            click.echo(_json.dumps({"error": str(e)}))
        else:
            click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    info = {
        "firebase_cli": version_str,
        "binary": binary,
        "active_project": resolved or "(none)",
    }
    if ctx.obj.get("json"):
        click.echo(_json.dumps(info, indent=2))
    else:
        click.echo(f"Firebase CLI: {info['firebase_cli']}")
        click.echo(f"Binary:       {info['binary']}")
        click.echo(f"Project:      {info['active_project']}")


if __name__ == "__main__":
    cli()
