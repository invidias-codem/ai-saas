"""
pr.py — Pull Request commands for the gh agent harness.
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


def output(data: dict, as_json: bool) -> None:
    """Print output as JSON or pretty text."""
    click.echo(json.dumps(data, indent=2))


@click.group("pr")
def pr_group():
    """Manage GitHub pull requests."""
    pass


# ── pr list ───────────────────────────────────────────────────────────────────

@pr_group.command("list")
@click.option("--repo", "-R", default=None, help="owner/repo (default: GITHUB_REPO)")
@click.option("--state", "-s", default="open",
              type=click.Choice(["open", "closed", "merged", "all"]),
              help="Filter by state (default: open)")
@click.option("--author", default=None, help="Filter by author login")
@click.option("--label", "-l", multiple=True, help="Filter by label")
@click.option("--limit", "-L", default=30, help="Max PRs to fetch (default: 30)")
@click.option("--search", "-S", default=None, help="Search query")
@click.option("--base", "-B", default=None, help="Filter by base branch")
@click.option("--draft/--no-draft", default=None, help="Filter drafts")
@click.option("--fields", default=None, help="Comma-separated JSON fields to include")
@click.option("--json", "as_json", is_flag=True, default=True, hidden=True)
def pr_list(repo, state, author, label, limit, search, base, draft, fields, as_json):
    """List pull requests."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "list", "--state", state, "--limit", str(limit)]
    if author:
        args += ["--author", author]
    for lbl in label:
        args += ["--label", lbl]
    if search:
        args += ["--search", search]
    if base:
        args += ["--base", base]
    if draft is True:
        args += ["--draft"]

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "pr", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "pr", "list", rc, stderr), indent=2))


# ── pr view ───────────────────────────────────────────────────────────────────

@pr_group.command("view")
@click.argument("pr_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def pr_view(pr_number, repo, fields):
    """View a pull request."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "view", str(pr_number)]
    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "pr", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "pr", "view", rc, stderr), indent=2))


# ── pr create ─────────────────────────────────────────────────────────────────

@pr_group.command("create")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--title", "-t", required=True, help="PR title")
@click.option("--body", "-b", default="", help="PR body")
@click.option("--base", "-B", default=None, help="Base branch")
@click.option("--head", "-H", default=None, help="Head branch")
@click.option("--draft/--no-draft", default=False, help="Create as draft")
@click.option("--label", "-l", multiple=True, help="Labels to add")
@click.option("--assignee", "-a", multiple=True, help="Assignees")
@click.option("--reviewer", "-r", multiple=True, help="Reviewers")
@click.option("--fill/--no-fill", default=False, help="Auto-fill from commits")
def pr_create(repo, title, body, base, head, draft, label, assignee, reviewer, fill):
    """Create a new pull request."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "create", "--title", title, "--body", body]
    if base:
        args += ["--base", base]
    if head:
        args += ["--head", head]
    if draft:
        args.append("--draft")
    if fill:
        args.append("--fill")
    for lbl in label:
        args += ["--label", lbl]
    for a in assignee:
        args += ["--assignee", a]
    for r in reviewer:
        args += ["--reviewer", r]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"url": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "pr", "create", rc, stderr), indent=2))


# ── pr merge ──────────────────────────────────────────────────────────────────

@pr_group.command("merge")
@click.argument("pr_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--merge/--no-merge", "use_merge", default=False, help="Merge commit")
@click.option("--rebase/--no-rebase", "use_rebase", default=False, help="Rebase merge")
@click.option("--squash/--no-squash", "use_squash", default=True, help="Squash merge (default)")
@click.option("--delete-branch/--no-delete-branch", default=True, help="Delete head branch after merge")
@click.option("--auto/--no-auto", default=False, help="Enable auto-merge")
def pr_merge(pr_number, repo, use_merge, use_rebase, use_squash, delete_branch, auto):
    """Merge a pull request."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "merge", str(pr_number)]
    if use_merge:
        args.append("--merge")
    elif use_rebase:
        args.append("--rebase")
    else:
        args.append("--squash")
    if delete_branch:
        args.append("--delete-branch")
    if auto:
        args.append("--auto")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "pr", "merge", rc, stderr), indent=2))


# ── pr review ─────────────────────────────────────────────────────────────────

@pr_group.command("review")
@click.argument("pr_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--approve", "action", flag_value="approve", help="Approve PR")
@click.option("--request-changes", "action", flag_value="request-changes",
              help="Request changes")
@click.option("--comment", "action", flag_value="comment", help="Leave comment review")
@click.option("--body", "-b", default="", help="Review body text")
def pr_review(pr_number, repo, action, body):
    """Review a pull request."""
    repo = repo or DEFAULT_REPO
    if not action:
        click.echo(json.dumps({"ok": False, "error": "Must specify --approve, --request-changes, or --comment"}))
        sys.exit(1)

    args = ["pr", "review", str(pr_number), f"--{action}"]
    if body:
        args += ["--body", body]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "pr", "review", rc, stderr), indent=2))


# ── pr checks ─────────────────────────────────────────────────────────────────

@pr_group.command("checks")
@click.argument("pr_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--watch/--no-watch", default=False, help="Watch until checks complete")
@click.option("--fail-fast/--no-fail-fast", default=False, help="Exit on first failure")
def pr_checks(pr_number, repo, watch, fail_fast):
    """Show CI status checks for a pull request."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "checks", str(pr_number)]
    if watch:
        args.append("--watch")
    if fail_fast:
        args.append("--fail-fast")

    rc, stdout, stderr = run_gh(args, repo=repo)
    # Parse checks output into structured form
    checks = _parse_checks_output(stdout)
    data = {"checks": checks, "raw": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "pr", "checks", rc, stderr), indent=2))


def _parse_checks_output(text: str) -> list[dict]:
    """Parse gh pr checks text output into structured list."""
    checks = []
    for line in text.strip().splitlines():
        parts = [p.strip() for p in line.split("\t") if p.strip()]
        if len(parts) >= 2:
            checks.append({
                "name": parts[0],
                "status": parts[1] if len(parts) > 1 else "unknown",
                "conclusion": parts[2] if len(parts) > 2 else "",
                "url": parts[3] if len(parts) > 3 else "",
            })
    return checks


# ── pr diff ───────────────────────────────────────────────────────────────────

@pr_group.command("diff")
@click.argument("pr_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--patch/--no-patch", default=False, help="Use patch format")
@click.option("--name-only/--no-name-only", default=False, help="Show only file names")
def pr_diff(pr_number, repo, patch, name_only):
    """Show diff for a pull request."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "diff", str(pr_number)]
    if patch:
        args.append("--patch")
    if name_only:
        args.append("--name-only")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"diff": stdout} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "pr", "diff", rc, stderr), indent=2))


# ── pr comment ────────────────────────────────────────────────────────────────

@pr_group.command("comment")
@click.argument("pr_number")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--body", "-b", required=True, help="Comment body")
@click.option("--edit-last/--no-edit-last", default=False, help="Edit the last comment")
def pr_comment(pr_number, repo, body, edit_last):
    """Add a comment to a pull request."""
    repo = repo or DEFAULT_REPO
    args = ["pr", "comment", str(pr_number), "--body", body]
    if edit_last:
        args.append("--edit-last")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"url": stdout.strip()} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "pr", "comment", rc, stderr), indent=2))
