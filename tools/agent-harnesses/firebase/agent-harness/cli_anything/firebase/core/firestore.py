"""
firestore.py — Firebase Firestore command group.

Wraps: firebase firestore:* commands
"""

from __future__ import annotations

import json as _json

import click

from ..utils.firebase_backend import run_firebase


@click.group("firestore")
def firestore_group() -> None:
    """Manage Cloud Firestore indexes, rules, and data."""


@firestore_group.command("indexes")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--database", default=None, help="Database ID (default: '(default)').")
@click.option("--pretty", is_flag=True, help="Pretty-print the index output.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def indexes(ctx: click.Context, project: str, database: str, pretty: bool, cwd: str) -> None:
    """List all Firestore indexes."""
    args = ["firestore:indexes"]
    if database:
        args += ["--database", database]
    if pretty:
        args.append("--pretty")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@firestore_group.command("rules")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def rules(ctx: click.Context, project: str, cwd: str) -> None:
    """Show Firestore security rules (deploy to apply)."""
    click.echo("Use 'deploy firestore' to deploy Firestore rules from firestore.rules.")
    click.echo("Use the Firebase console to view live rules.")


@firestore_group.command("export")
@click.argument("path")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--database", default=None, help="Database ID (default: '(default)').")
@click.option("--collections", default=None, help="Comma-separated collection group IDs to export.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def export(ctx: click.Context, path: str, project: str, database: str, collections: str, cwd: str) -> None:
    """Export Firestore data to a GCS bucket or local path.

    PATH is the GCS URI or local directory (e.g. gs://bucket/exports/2025).
    """
    args = ["firestore:export", path]
    if database:
        args += ["--database", database]
    if collections:
        args += ["--collection-ids", collections]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@firestore_group.command("import")
@click.argument("path")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--database", default=None, help="Database ID (default: '(default)').")
@click.option("--collections", default=None, help="Comma-separated collection group IDs to import.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def import_data(ctx: click.Context, path: str, project: str, database: str, collections: str, cwd: str) -> None:
    """Import Firestore data from a GCS export.

    PATH is the GCS URI of a previous export.
    """
    args = ["firestore:import", path]
    if database:
        args += ["--database", database]
    if collections:
        args += ["--collection-ids", collections]
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@firestore_group.command("delete")
@click.argument("path", required=False, default=None)
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--database", default=None, help="Database ID (default: '(default)').")
@click.option("--all-collections", is_flag=True, help="Delete all collections (destructive!).")
@click.option("--recursive", "-r", is_flag=True, help="Recursively delete all subcollections.")
@click.option("--force", "-f", is_flag=True, help="Skip confirmation prompt.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def delete(
    ctx: click.Context,
    path: str,
    project: str,
    database: str,
    all_collections: bool,
    recursive: bool,
    force: bool,
    cwd: str,
) -> None:
    """Delete Firestore documents or collections at PATH."""
    if not path and not all_collections:
        raise click.UsageError("Provide a PATH or use --all-collections.")
    args = ["firestore:delete"]
    if path:
        args.append(path)
    if database:
        args += ["--database", database]
    if all_collections:
        args.append("--all-collections")
    if recursive:
        args.append("--recursive")
    if force:
        args.append("--force")
    result = run_firebase(args, project=project, cwd=cwd)
    _output(ctx, result)


@firestore_group.command("locations")
@click.option("--project", "-P", default=None, help="Firebase project ID or alias.")
@click.option("--cwd", default=None, hidden=True)
@click.pass_context
def locations(ctx: click.Context, project: str, cwd: str) -> None:
    """List possible Firestore database locations."""
    args = ["firestore:locations"]
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
