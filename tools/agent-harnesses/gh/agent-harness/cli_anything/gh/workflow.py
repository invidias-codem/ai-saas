"""
workflow.py — GitHub Actions workflow commands.
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


@click.group("workflow")
def workflow_group():
    """View and manage GitHub Actions workflows."""
    pass


# ── workflow list ─────────────────────────────────────────────────────────────

@workflow_group.command("list")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--all/--no-all", "show_all", default=False,
              help="Include disabled workflows")
@click.option("--limit", "-L", default=50, help="Max results (default: 50)")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def workflow_list(repo, show_all, limit, fields):
    """List workflows in a repository."""
    repo = repo or DEFAULT_REPO
    args = ["workflow", "list", "--limit", str(limit)]
    if show_all:
        args.append("--all")

    field_list = fields.split(",") if fields else None
    rc, data, stderr = run_gh_json(args, "workflow", repo=repo, fields=field_list)
    click.echo(json.dumps(normalize_output(data, "workflow", "list", rc, stderr), indent=2))


# ── workflow view ─────────────────────────────────────────────────────────────

@workflow_group.command("view")
@click.argument("workflow_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--yaml/--no-yaml", "show_yaml", default=False, help="Show workflow YAML")
@click.option("--fields", default=None, help="Comma-separated JSON fields")
def workflow_view(workflow_id, repo, show_yaml, fields):
    """View a workflow."""
    repo = repo or DEFAULT_REPO
    args = ["workflow", "view", str(workflow_id)]
    if show_yaml:
        args.append("--yaml")

    field_list = fields.split(",") if fields else None
    if show_yaml:
        rc, stdout, stderr = run_gh(args, repo=repo)
        data = {"yaml": stdout} if rc == 0 else None
        click.echo(json.dumps(normalize_output(data, "workflow", "view", rc, stderr), indent=2))
    else:
        rc, data, stderr = run_gh_json(args, "workflow", repo=repo, fields=field_list)
        click.echo(json.dumps(normalize_output(data, "workflow", "view", rc, stderr), indent=2))


# ── workflow enable ───────────────────────────────────────────────────────────

@workflow_group.command("enable")
@click.argument("workflow_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
def workflow_enable(workflow_id, repo):
    """Enable a workflow."""
    repo = repo or DEFAULT_REPO
    args = ["workflow", "enable", str(workflow_id)]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip() or f"Workflow '{workflow_id}' enabled"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "workflow", "enable", rc, stderr), indent=2))


# ── workflow disable ──────────────────────────────────────────────────────────

@workflow_group.command("disable")
@click.argument("workflow_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
def workflow_disable(workflow_id, repo):
    """Disable a workflow."""
    repo = repo or DEFAULT_REPO
    args = ["workflow", "disable", str(workflow_id)]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip() or f"Workflow '{workflow_id}' disabled"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "workflow", "disable", rc, stderr), indent=2))


# ── workflow run ──────────────────────────────────────────────────────────────

@workflow_group.command("run")
@click.argument("workflow_id")
@click.option("--repo", "-R", default=None, help="owner/repo")
@click.option("--ref", default=None, help="Branch/tag/SHA to run workflow on")
@click.option("--field", "-f", multiple=True,
              help="Input field in key=value format (repeatable)")
def workflow_run(workflow_id, repo, ref, field):
    """Trigger a workflow_dispatch event to run a workflow."""
    repo = repo or DEFAULT_REPO
    args = ["workflow", "run", str(workflow_id)]
    if ref:
        args += ["--ref", ref]
    for f in field:
        args += ["--field", f]

    rc, stdout, stderr = run_gh(args, repo=repo)
    data = {"message": stdout.strip() or f"Workflow '{workflow_id}' triggered"} if rc == 0 else None
    click.echo(json.dumps(normalize_output(data, "workflow", "run", rc, stderr), indent=2))
