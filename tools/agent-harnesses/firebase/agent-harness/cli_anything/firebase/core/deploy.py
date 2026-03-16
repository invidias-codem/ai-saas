"""
deploy.py — Firebase deploy command group.

Wraps: firebase deploy [options]
"""

from __future__ import annotations

import click

from ..utils.firebase_backend import run_firebase


@click.group("deploy")
def deploy_group() -> None:
    """Deploy code and assets to Firebase."""


@deploy_group.command("all")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--message", "-m", default=None, help="Message describing this deploy.")
@click.option("--force", "-f", is_flag=True, help="Skip interactive prompts.")
@click.option("--dry-run", is_flag=True, help="Validate without deploying.")
@click.option("--cwd", default=None, hidden=True, help="Working directory.")
@click.pass_context
def deploy_all(ctx: click.Context, project: str, message: str, force: bool, dry_run: bool, cwd: str) -> None:
    """Deploy all targets (hosting, functions, firestore, etc.)."""
    args = ["deploy"]
    if message:
        args += ["--message", message]
    if force:
        args.append("--force")
    if dry_run:
        args.append("--dry-run")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@deploy_group.command("hosting")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--message", "-m", default=None, help="Message describing this deploy.")
@click.option("--dry-run", is_flag=True, help="Validate without deploying.")
@click.option("--cwd", default=None, hidden=True, help="Working directory.")
@click.pass_context
def deploy_hosting(ctx: click.Context, project: str, message: str, dry_run: bool, cwd: str) -> None:
    """Deploy Firebase Hosting only."""
    args = ["deploy", "--only", "hosting"]
    if message:
        args += ["--message", message]
    if dry_run:
        args.append("--dry-run")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@deploy_group.command("functions")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--only", default=None, help="Comma-separated function names to deploy.")
@click.option("--force", "-f", is_flag=True, help="Skip interactive prompts.")
@click.option("--dry-run", is_flag=True, help="Validate without deploying.")
@click.option("--cwd", default=None, hidden=True, help="Working directory.")
@click.pass_context
def deploy_functions(ctx: click.Context, project: str, only: str, force: bool, dry_run: bool, cwd: str) -> None:
    """Deploy Firebase Functions only."""
    if only:
        target = ",".join(f"functions:{fn}" for fn in only.split(","))
    else:
        target = "functions"
    args = ["deploy", "--only", target]
    if force:
        args.append("--force")
    if dry_run:
        args.append("--dry-run")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@deploy_group.command("firestore")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--dry-run", is_flag=True, help="Validate without deploying.")
@click.option("--cwd", default=None, hidden=True, help="Working directory.")
@click.pass_context
def deploy_firestore(ctx: click.Context, project: str, dry_run: bool, cwd: str) -> None:
    """Deploy Firestore rules and indexes only."""
    args = ["deploy", "--only", "firestore"]
    if dry_run:
        args.append("--dry-run")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@deploy_group.command("preview-channel")
@click.argument("channel_id")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--expires", default=None, help="Channel expiry (e.g. 7d, 30d).")
@click.option("--cwd", default=None, hidden=True, help="Working directory.")
@click.pass_context
def deploy_preview_channel(ctx: click.Context, channel_id: str, project: str, expires: str, cwd: str) -> None:
    """Deploy to a Firebase Hosting preview channel."""
    args = ["hosting:channel:deploy", channel_id]
    if expires:
        args += ["--expires", expires]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


def _output(ctx: click.Context, result) -> None:
    import json as _json
    if ctx.obj and ctx.obj.get("json"):
        click.echo(_json.dumps(result.to_dict(), indent=2))
    else:
        if result.stdout:
            click.echo(result.stdout)
        if result.stderr and not result.success:
            click.echo(result.stderr, err=True)
    if not result.success:
        ctx.exit(result.returncode)
