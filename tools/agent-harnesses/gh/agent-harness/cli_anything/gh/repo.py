"""
repo.py — Repository commands for the gh agent harness.
"""

from __future__ import annotations

import json
from typing import Optional

import click

from .utils.gh_backend import (
    DEFAULT_REPO,
    normalize_output,
    run_gh,
    run_gh_json,
)


@click.group("repo")
def repo_group():
    """Manage GitHub repositories."""
    pass


# ── repo view ─────────────────────────────────────────────────────────────────

@repo_group.command("view")
@click.argument("repository", default=None, required=False)
@click.option("--repo", "-R", default=None, help="owner/repo (overrides positional)")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def repo_view(repository, repo, fields):
    """View repository information."""
    target = repo or repository or DEFAULT_REPO
    args = ["repo", "view", target]
    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "repo", fields=field_list)
    click.echo(json.dumps(normalize_output(data, "repo", "view", rc, stderr), indent=2))


# ── repo list ─────────────────────────────────────────────────────────────────

@repo_group.command("list")
@click.argument("owner", default=None, required=False)
@click.option("--limit", "-L", default=30, help="Max repos (default: 30)")
@click.option("--type", "repo_type",
              type=click.Choice(["all", "public", "private", "forks", "sources", "archived"]),
              default="all", help="Filter by type")
@click.option("--language", default=None, help="Filter by primary language")
@click.option("--topic", multiple=True, help="Filter by topic")
@click.option("--archived/--no-archived", default=None, help="Filter archived status")
@click.option("--fork/--no-fork", default=None, help="Filter fork status")
@click.option("--source/--no-source", default=None, help="Filter source repos")
@click.option("--json/--no-json", "as_json", default=True, hidden=True)
def repo_list(owner, limit, repo_type, language, topic, archived, fork, source, as_json):
    """List repositories for a user or organization."""
    args = ["repo", "list"]
    if owner:
        args.append(owner)
    args += ["--limit", str(limit)]
    if repo_type != "all":
        if repo_type == "forks":
            args.append("--fork")
        elif repo_type == "archived":
            args.append("--archived")
        elif repo_type == "sources":
            args.append("--source")
        else:
            args += ["--visibility", repo_type]
    if language:
        args += ["--language", language]
    for t in topic:
        args += ["--topic", t]

    rc, stdout, stderr = run_gh(args)
    # repo list doesn't support --json the same way, parse text output
    repos = _parse_repo_list(stdout)
    data = repos if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "repo", "list", rc, stderr), indent=2))


def _parse_repo_list(text: str) -> list[dict]:
    """Parse repo list tab-separated output."""
    repos = []
    for line in text.strip().splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        repo = {
            "nameWithOwner": parts[0].strip() if len(parts) > 0 else "",
            "description": parts[1].strip() if len(parts) > 1 else "",
            "visibility": parts[2].strip() if len(parts) > 2 else "",
            "updatedAt": parts[3].strip() if len(parts) > 3 else "",
        }
        repos.append(repo)
    return repos


# ── repo clone ────────────────────────────────────────────────────────────────

@repo_group.command("clone")
@click.argument("repository")
@click.argument("directory", default=None, required=False)
@click.option("--depth", default=None, type=int, help="Create a shallow clone (commits)")
def repo_clone(repository, directory, depth):
    """Clone a repository locally."""
    args = ["repo", "clone", repository]
    if directory:
        args.append(directory)
    if depth:
        args += ["--", f"--depth={depth}"]

    rc, stdout, stderr = run_gh(args)
    data = {
        "message": stdout.strip() or f"Cloned {repository}",
        "directory": directory or repository.split("/")[-1],
    } if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "repo", "clone", rc, stderr), indent=2))


# ── repo fork ─────────────────────────────────────────────────────────────────

@repo_group.command("fork")
@click.argument("repository", default=None, required=False)
@click.option("--repo", "-R", default=None, help="owner/repo to fork")
@click.option("--clone/--no-clone", default=False, help="Clone after forking")
@click.option("--remote/--no-remote", default=False, help="Add remote after forking")
@click.option("--fork-name", default=None, help="Name for the new fork")
@click.option("--org", default=None, help="Organization to fork into")
def repo_fork(repository, repo, clone, remote, fork_name, org):
    """Create a fork of a repository."""
    target = repo or repository
    args = ["repo", "fork"]
    if target:
        args.append(target)
    if clone:
        args.append("--clone")
    if remote:
        args.append("--remote")
    if fork_name:
        args += ["--fork-name", fork_name]
    if org:
        args += ["--org", org]

    rc, stdout, stderr = run_gh(args)
    data = {"message": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "repo", "fork", rc, stderr), indent=2))


# ── repo sync ─────────────────────────────────────────────────────────────────

@repo_group.command("sync")
@click.argument("repository", default=None, required=False)
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--branch", "-b", default=None, help="Branch to sync (default: default branch)")
@click.option("--force/--no-force", default=False, help="Force sync, overwriting changes")
@click.option("--source", "source_repo", default=None, help="Source repo (owner/repo)")
def repo_sync(repository, repo, branch, force, source_repo):
    """Sync a repository branch from its upstream."""
    target = repo or repository or DEFAULT_REPO
    args = ["repo", "sync", target]
    if branch:
        args += ["--branch", branch]
    if force:
        args.append("--force")
    if source_repo:
        args += ["--source", source_repo]

    rc, stdout, stderr = run_gh(args)
    data = {"message": stdout.strip() or f"{target} synced"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "repo", "sync", rc, stderr), indent=2))
