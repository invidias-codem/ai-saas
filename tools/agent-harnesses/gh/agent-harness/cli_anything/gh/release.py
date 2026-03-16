"""
release.py — Release commands for the gh agent harness.
"""

from __future__ import annotations

import json

import click

from .utils.gh_backend import (
    DEFAULT_REPO,
    normalize_output,
    run_gh,
    run_gh_json,
)


@click.group("release")
def release_group():
    """Manage GitHub releases."""
    pass


# ── release list ──────────────────────────────────────────────────────────────

@release_group.command("list")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--limit", "-L", default=30, help="Max releases (default: 30)")
@click.option("--exclude-drafts/--no-exclude-drafts", default=False,
              help="Exclude draft releases")
@click.option("--exclude-pre-releases/--no-exclude-pre-releases", default=False,
              help="Exclude pre-releases")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def release_list(repo, limit, exclude_drafts, exclude_pre_releases, fields):
    """List releases in a repository."""
    repo = repo or DEFAULT_REPO
    args = ["release", "list", "--limit", str(limit)]
    if exclude_drafts:
        args.append("--exclude-drafts")
    if exclude_pre_releases:
        args.append("--exclude-pre-releases")

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "release", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "release", "list", rc, stderr), indent=2))


# ── release view ──────────────────────────────────────────────────────────────

@release_group.command("view")
@click.argument("tag", default=None, required=False)
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def release_view(tag, repo, fields):
    """View a release. If no tag given, views the latest release."""
    repo = repo or DEFAULT_REPO
    args = ["release", "view"]
    if tag:
        args.append(tag)

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "release", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "release", "view", rc, stderr), indent=2))


# ── release create ────────────────────────────────────────────────────────────

@release_group.command("create")
@click.argument("tag")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--title", "-t", default=None, help="Release title")
@click.option("--notes", "-n", default="", help="Release notes")
@click.option("--notes-file", default=None, help="Read release notes from file")
@click.option("--draft/--no-draft", default=False, help="Save as draft")
@click.option("--prerelease/--no-prerelease", default=False, help="Mark as pre-release")
@click.option("--target", default=None, help="Target commitish (branch/SHA)")
@click.option("--generate-notes/--no-generate-notes", default=False,
              help="Auto-generate release notes")
@click.option("--latest/--no-latest", default=True, help="Mark as latest release")
@click.argument("files", nargs=-1)
def release_create(tag, repo, title, notes, notes_file, draft, prerelease,
                   target, generate_notes, latest, files):
    """Create a new release."""
    repo = repo or DEFAULT_REPO
    args = ["release", "create", tag]
    if title:
        args += ["--title", title]
    if notes:
        args += ["--notes", notes]
    if notes_file:
        args += ["--notes-file", notes_file]
    if draft:
        args.append("--draft")
    if prerelease:
        args.append("--prerelease")
    if target:
        args += ["--target", target]
    if generate_notes:
        args.append("--generate-notes")
    if not latest:
        args.append("--latest=false")
    args.extend(files)

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"url": stdout.strip(), "tag": tag} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "release", "create", rc, stderr), indent=2))


# ── release upload ────────────────────────────────────────────────────────────

@release_group.command("upload")
@click.argument("tag")
@click.argument("files", nargs=-1, required=True)
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--clobber/--no-clobber", default=False,
              help="Overwrite existing assets with same name")
def release_upload(tag, files, repo, clobber):
    """Upload assets to a release."""
    repo = repo or DEFAULT_REPO
    args = ["release", "upload", tag] + list(files)
    if clobber:
        args.append("--clobber")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {
        "message": stdout.strip() or f"Assets uploaded to release {tag}",
        "files": list(files),
        "tag": tag,
    } if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "release", "upload", rc, stderr), indent=2))


# ── release delete ────────────────────────────────────────────────────────────

@release_group.command("delete")
@click.argument("tag")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--yes/--no-yes", default=False, help="Skip confirmation prompt")
@click.option("--cleanup-tag/--no-cleanup-tag", default=False,
              help="Also delete the git tag")
def release_delete(tag, repo, yes, cleanup_tag):
    """Delete a release."""
    repo = repo or DEFAULT_REPO
    args = ["release", "delete", tag]
    if yes:
        args.append("--yes")
    if cleanup_tag:
        args.append("--cleanup-tag")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip() or f"Release {tag} deleted"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "release", "delete", rc, stderr), indent=2))
