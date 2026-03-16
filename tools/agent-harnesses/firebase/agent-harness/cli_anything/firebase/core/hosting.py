"""
hosting.py — Firebase Hosting command group.

Wraps: firebase hosting:channel:* commands
"""

from __future__ import annotations

import json as _json

import click

from ..utils.firebase_backend import run_firebase


@click.group("hosting")
def hosting_group() -> None:
    """Manage Firebase Hosting channels and deployments."""


@hosting_group.command("channel-list")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--site", default=None, help="Site name to list channels for.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def channel_list(ctx: click.Context, project: str, site: str, cwd: str) -> None:
    """List all Hosting channels for the project."""
    args = ["hosting:channel:list"]
    if site:
        args += ["--site", site]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@hosting_group.command("channel-create")
@click.argument("channel_id")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--site", default=None, help="Target site.")
@click.option("--expires", default=None, help="Expiry duration (e.g. 7d).")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def channel_create(ctx: click.Context, channel_id: str, project: str, site: str, expires: str, cwd: str) -> None:
    """Create a new Hosting preview channel."""
    args = ["hosting:channel:create", channel_id]
    if site:
        args += ["--site", site]
    if expires:
        args += ["--expires", expires]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@hosting_group.command("channel-deploy")
@click.argument("channel_id")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--site", default=None, help="Target site.")
@click.option("--expires", default=None, help="Expiry duration (e.g. 7d).")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def channel_deploy(ctx: click.Context, channel_id: str, project: str, site: str, expires: str, cwd: str) -> None:
    """Deploy to a Hosting preview channel."""
    args = ["hosting:channel:deploy", channel_id]
    if site:
        args += ["--site", site]
    if expires:
        args += ["--expires", expires]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@hosting_group.command("channel-delete")
@click.argument("channel_id")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--site", default=None, help="Target site.")
@click.option("--force", "-f", is_flag=True, help="Skip confirmation prompt.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def channel_delete(ctx: click.Context, channel_id: str, project: str, site: str, force: bool, cwd: str) -> None:
    """Delete a Hosting preview channel."""
    args = ["hosting:channel:delete", channel_id]
    if site:
        args += ["--site", site]
    if force:
        args.append("--force")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@hosting_group.command("channel-clone")
@click.argument("source_channel")
@click.argument("target_channel")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--site", default=None, help="Target site.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def channel_clone(
    ctx: click.Context,
    source_channel: str,
    target_channel: str,
    project: str,
    site: str,
    cwd: str,
) -> None:
    """Clone a Hosting channel to another channel."""
    args = ["hosting:channel:clone", source_channel, target_channel]
    if site:
        args += ["--site", site]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@hosting_group.command("sites-list")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def sites_list(ctx: click.Context, project: str, cwd: str) -> None:
    """List all Hosting sites for the project."""
    args = ["hosting:sites:list"]
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
