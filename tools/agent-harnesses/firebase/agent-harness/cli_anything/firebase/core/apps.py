"""
apps.py — Firebase Apps command group.

Wraps: firebase apps:* commands
"""

from __future__ import annotations

import json as _json

import click

from ..utils.firebase_backend import run_firebase


@click.group("apps")
def apps_group() -> None:
    """Manage Firebase apps (iOS, Android, Web)."""


PLATFORM_CHOICES = click.Choice(["IOS", "ANDROID", "WEB"], case_sensitive=False)


@apps_group.command("list")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--platform", default=None, type=PLATFORM_CHOICES, help="Filter by platform.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def apps_list(ctx: click.Context, project: str, platform: str, cwd: str) -> None:
    """List all registered Firebase apps."""
    args = ["apps:list"]
    if platform:
        args.append(platform.upper())
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@apps_group.command("create")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--platform", default=None, type=PLATFORM_CHOICES, help="App platform (IOS, ANDROID, WEB).")
@click.option("--display-name", "-n", default=None, help="Display name for the app.")
@click.option("--bundle-id", default=None, help="Bundle ID for iOS apps.")
@click.option("--package-name", default=None, help="Package name for Android apps.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def apps_create(
    ctx: click.Context,
    project: str,
    platform: str,
    display_name: str,
    bundle_id: str,
    package_name: str,
    cwd: str,
) -> None:
    """Create a new Firebase app."""
    args = ["apps:create"]
    if platform:
        args.append(platform.upper())
    if display_name:
        args.append(display_name)
    if bundle_id:
        args += ["--bundle-id", bundle_id]
    if package_name:
        args += ["--package-name", package_name]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@apps_group.command("sdkconfig")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--platform", default=None, type=PLATFORM_CHOICES, help="App platform (IOS, ANDROID, WEB).")
@click.option("--app-id", default=None, help="Specific app ID to fetch config for.")
@click.option("--out", default=None, help="Write config to this file.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def apps_sdkconfig(
    ctx: click.Context,
    project: str,
    platform: str,
    app_id: str,
    out: str,
    cwd: str,
) -> None:
    """Print the Google Services config for a Firebase app."""
    args = ["apps:sdkconfig"]
    if platform:
        args.append(platform.upper())
    if app_id:
        args.append(app_id)
    if out:
        args += ["--out", out]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@apps_group.command("android-sha-list")
@click.argument("app_id")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def android_sha_list(ctx: click.Context, app_id: str, project: str, cwd: str) -> None:
    """List SHA certificate hashes for an Android app."""
    args = ["apps:android:sha:list", app_id]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@apps_group.command("android-sha-create")
@click.argument("app_id")
@click.argument("sha_hash")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def android_sha_create(ctx: click.Context, app_id: str, sha_hash: str, project: str, cwd: str) -> None:
    """Add a SHA certificate hash to an Android app."""
    args = ["apps:android:sha:create", app_id, sha_hash]
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
