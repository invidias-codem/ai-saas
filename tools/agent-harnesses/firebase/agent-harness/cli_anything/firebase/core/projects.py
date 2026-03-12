"""
projects.py — Firebase Projects command group.

Wraps: firebase projects:* and firebase use commands
"""

from __future__ import annotations

import json as _json

import click

from ..utils.firebase_backend import run_firebase


@click.group("projects")
def projects_group() -> None:
    """Manage Firebase projects."""


@projects_group.command("list")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def projects_list(ctx: click.Context, cwd: str) -> None:
    """List all Firebase projects you have access to."""
    args = ["projects:list"]
    result = run_firebase(args, cwd=cwd)
    _output(ctx, result)


@projects_group.command("create")
@click.argument("project_id", required=False, default=None)
@click.option("--display-name", "-n", default=None, help="Display name for the project.")
@click.option("--organization", "-o", default=None, help="Google Cloud organization ID.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def projects_create(ctx: click.Context, project_id: str, display_name: str, organization: str, cwd: str) -> None:
    """Create a new Firebase project."""
    args = ["projects:create"]
    if project_id:
        args.append(project_id)
    if display_name:
        args += ["--display-name", display_name]
    if organization:
        args += ["--organization", organization]
    result = run_firebase(args, cwd=cwd)
    _output(ctx, result)


@projects_group.command("use")
@click.argument("alias_or_project_id")
@click.option("--add", is_flag=True, help="Add a new alias for the project.")
@click.option("--alias", default=None, help="Create alias for project when using --add.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def projects_use(ctx: click.Context, alias_or_project_id: str, add: bool, alias: str, cwd: str) -> None:
    """Set the active Firebase project for your working directory."""
    args = ["use", alias_or_project_id]
    if add:
        args.append("--add")
    if alias:
        args += ["--alias", alias]
    result = run_firebase(args, cwd=cwd)
    _output(ctx, result)


@projects_group.command("info")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def projects_info(ctx: click.Context, project: str, cwd: str) -> None:
    """Show info about the active Firebase project."""
    # firebase projects:list filtered by current project is the closest
    # the CLI doesn't have a 'projects:info' command, so we list and describe
    args = ["projects:list"]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@projects_group.command("add-firebase")
@click.argument("gcp_project_id")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def add_firebase(ctx: click.Context, gcp_project_id: str, cwd: str) -> None:
    """Add Firebase resources to an existing Google Cloud Platform project."""
    args = ["projects:addfirebase", gcp_project_id]
    result = run_firebase(args, cwd=cwd)
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
