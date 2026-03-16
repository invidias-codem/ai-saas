"""
run.py — GitHub Actions workflow run commands.
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


@click.group("run")
def run_group():
    """View and manage GitHub Actions workflow runs."""
    pass


# ── run list ──────────────────────────────────────────────────────────────────

@run_group.command("list")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--workflow", "-w", default=None, help="Filter by workflow name or ID")
@click.option("--branch", "-b", default=None, help="Filter by branch")
@click.option("--event", "-e", default=None, help="Filter by event (push, pull_request, ...)")
@click.option("--status", "-s", default=None,
              type=click.Choice(["queued", "in_progress", "completed",
                                 "success", "failure", "cancelled"]),
              help="Filter by status")
@click.option("--limit", "-L", default=20, help="Max runs (default: 20)")
@click.option("--user", "-u", default=None, help="Filter by triggering user")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def run_list(repo, workflow, branch, event, status, limit, user, fields):
    """List recent workflow runs."""
    repo = repo or DEFAULT_REPO
    args = ["run", "list", "--limit", str(limit)]
    if workflow:
        args += ["--workflow", workflow]
    if branch:
        args += ["--branch", branch]
    if event:
        args += ["--event", event]
    if status:
        args += ["--status", status]
    if user:
        args += ["--user", user]

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "run", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "run", "list", rc, stderr), indent=2))


# ── run view ──────────────────────────────────────────────────────────────────

@run_group.command("view")
@click.argument("run_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--exit-status/--no-exit-status", default=False,
              help="Exit with non-zero status if run failed")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def run_view(run_id, repo, exit_status, fields):
    """View a workflow run."""
    repo = repo or DEFAULT_REPO
    args = ["run", "view", str(run_id)]
    if exit_status:
        args.append("--exit-status")

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "run", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "run", "view", rc, stderr), indent=2))


# ── run watch ─────────────────────────────────────────────────────────────────

@run_group.command("watch")
@click.argument("run_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--exit-status/--no-exit-status", default=True,
              help="Exit non-zero if run fails")
@click.option("--interval", default=3, help="Polling interval in seconds (default: 3)")
def run_watch(run_id, repo, exit_status, interval):
    """Watch a run until it completes."""
    repo = repo or DEFAULT_REPO
    args = ["run", "watch", str(run_id), "--interval", str(interval)]
    if exit_status:
        args.append("--exit-status")

    rc, stdout, stderr = run_gh(args, repo=repo, timeout=3600)
    data = {"message": stdout.strip(), "run_id": run_id} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "run", "watch", rc, stderr), indent=2))


# ── run logs ──────────────────────────────────────────────────────────────────

@run_group.command("logs")
@click.argument("run_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--job", "-j", default=None, help="View logs for specific job")
@click.option("--failed/--no-failed", default=False, help="Only show failed step logs")
def run_logs(run_id, repo, job, failed):
    """View logs for a workflow run."""
    repo = repo or DEFAULT_REPO
    args = ["run", "view", "--log", str(run_id)]
    if job:
        args += ["--job", job]
    if failed:
        args.append("--log-failed")

    rc, stdout, stderr = run_gh(args, repo=repo, timeout=120)
    data = {"logs": stdout} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "run", "logs", rc, stderr), indent=2))


# ── run rerun ─────────────────────────────────────────────────────────────────

@run_group.command("rerun")
@click.argument("run_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--failed-only/--no-failed-only", default=False,
              help="Only rerun failed jobs")
@click.option("--debug/--no-debug", default=False, help="Enable debug logging")
def run_rerun(run_id, repo, failed_only, debug):
    """Rerun a workflow run."""
    repo = repo or DEFAULT_REPO
    args = ["run", "rerun", str(run_id)]
    if failed_only:
        args.append("--failed")
    if debug:
        args.append("--debug")

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip() or f"Run {run_id} re-queued"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "run", "rerun", rc, stderr), indent=2))


# ── run cancel ────────────────────────────────────────────────────────────────

@run_group.command("cancel")
@click.argument("run_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
def run_cancel(run_id, repo):
    """Cancel a running workflow run."""
    repo = repo or DEFAULT_REPO
    args = ["run", "cancel", str(run_id)]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip() or f"Run {run_id} cancelled"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "run", "cancel", rc, stderr), indent=2))
