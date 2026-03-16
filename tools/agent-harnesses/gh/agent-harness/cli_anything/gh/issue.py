"""
issue.py — Issue commands for the gh agent harness.
"""

from __future__ import annotations

import json
import sys
from typing import Optional

import click

from .utils.gh_backend import (
    DEFAULT_REPO,
    normalize_output,
    run_gh,
    run_gh_json,
)


@click.group("issue")
def issue_group():
    """Manage GitHub issues."""
    pass


# ── issue list ────────────────────────────────────────────────────────────────

@issue_group.command("list")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--state", "-s", default="open",
              type=click.Choice(["open", "closed", "all"]),
              help="Filter by state (default: open)")
@click.option("--author", default=None, help="Filter by author")
@click.option("--assignee", "-a", default=None, help="Filter by assignee")
@click.option("--label", "-l", multiple=True, help="Filter by label")
@click.option("--milestone", "-m", default=None, help="Filter by milestone")
@click.option("--limit", "-L", default=30, help="Max issues (default: 30)")
@click.option("--search", "-S", default=None, help="Search query")
@click.option("--mention", default=None, help="Filter by mention")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def issue_list(repo, state, author, assignee, label, milestone, limit, search, mention, fields):
    """List issues in a repository."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "list", "--state", state, "--limit", str(limit)]
    if author:
        args += ["--author", author]
    if assignee:
        args += ["--assignee", assignee]
    for lbl in label:
        args += ["--label", lbl]
    if milestone:
        args += ["--milestone", milestone]
    if search:
        args += ["--search", search]
    if mention:
        args += ["--mention", mention]

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "issue", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "issue", "list", rc, stderr), indent=2))


# ── issue view ────────────────────────────────────────────────────────────────

@issue_group.command("view")
@click.argument("issue_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def issue_view(issue_number, repo, fields):
    """View an issue."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "view", str(issue_number)]
    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "issue", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "issue", "view", rc, stderr), indent=2))


# ── issue create ──────────────────────────────────────────────────────────────

@issue_group.command("create")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--title", "-t", required=True, help="Issue title")
@click.option("--body", "-b", default="", help="Issue body")
@click.option("--label", "-l", multiple=True, help="Labels to add")
@click.option("--assignee", "-a", multiple=True, help="Assignees")
@click.option("--milestone", "-m", default=None, help="Milestone name/number")
@click.option("--project", "-p", default=None, help="Project to add issue to")
def issue_create(repo, title, body, label, assignee, milestone, project):
    """Create a new issue."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "create", "--title", title, "--body", body]
    for lbl in label:
        args += ["--label", lbl]
    for a in assignee:
        args += ["--assignee", a]
    if milestone:
        args += ["--milestone", milestone]
    if project:
        args += ["--project", project]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"url": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "issue", "create", rc, stderr), indent=2))


# ── issue close ───────────────────────────────────────────────────────────────

@issue_group.command("close")
@click.argument("issue_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--reason", default=None,
              type=click.Choice(["completed", "not planned", "duplicate"]),
              help="Reason for closing")
@click.option("--comment", "-c", default=None, help="Comment when closing")
def issue_close(issue_number, repo, reason, comment):
    """Close an issue."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "close", str(issue_number)]
    if reason:
        args += ["--reason", reason]
    if comment:
        args += ["--comment", comment]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": f"Issue #{issue_number} closed"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "issue", "close", rc, stderr), indent=2))


# ── issue reopen ──────────────────────────────────────────────────────────────

@issue_group.command("reopen")
@click.argument("issue_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--comment", "-c", default=None, help="Comment when reopening")
def issue_reopen(issue_number, repo, comment):
    """Reopen a closed issue."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "reopen", str(issue_number)]
    if comment:
        args += ["--comment", comment]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": f"Issue #{issue_number} reopened"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "issue", "reopen", rc, stderr), indent=2))


# ── issue comment ─────────────────────────────────────────────────────────────

@issue_group.command("comment")
@click.argument("issue_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--body", "-b", required=True, help="Comment body")
@click.option("--edit-last/--no-edit-last", default=False, help="Edit last comment")
def issue_comment(issue_number, repo, body, edit_last):
    """Add a comment to an issue."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "comment", str(issue_number), "--body", body]
    if edit_last:
        args.append("--edit-last")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"url": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "issue", "comment", rc, stderr), indent=2))


# ── issue edit ────────────────────────────────────────────────────────────────

@issue_group.command("edit")
@click.argument("issue_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--title", "-t", default=None, help="New title")
@click.option("--body", "-b", default=None, help="New body")
@click.option("--add-label", multiple=True, help="Labels to add")
@click.option("--remove-label", multiple=True, help="Labels to remove")
@click.option("--add-assignee", multiple=True, help="Assignees to add")
@click.option("--remove-assignee", multiple=True, help="Assignees to remove")
@click.option("--milestone", "-m", default=None, help="Milestone")
def issue_edit(issue_number, repo, title, body, add_label, remove_label,
               add_assignee, remove_assignee, milestone):
    """Edit an issue."""
    repo = repo or DEFAULT_REPO
    args = ["issue", "edit", str(issue_number)]
    if title:
        args += ["--title", title]
    if body:
        args += ["--body", body]
    for lbl in add_label:
        args += ["--add-label", lbl]
    for lbl in remove_label:
        args += ["--remove-label", lbl]
    for a in add_assignee:
        args += ["--add-assignee", a]
    for a in remove_assignee:
        args += ["--remove-assignee", a]
    if milestone:
        args += ["--milestone", milestone]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"url": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "issue", "edit", rc, stderr), indent=2))
