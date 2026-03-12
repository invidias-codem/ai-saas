"""
gh_cli.py — Main CLI entry point for the gh agent harness.

Usage:
    cli-anything-gh [COMMAND] [ARGS...]
    cli-anything-gh repl              # Interactive REPL with repo context
    cli-anything-gh status            # Show config and auth status
    cli-anything-gh set-repo OWNER/REPO  # Set default repo for session

Environment:
    GITHUB_REPO    Default repository (owner/name), default: invidias-codem/ai-saas
"""

from __future__ import annotations

import json
import os
import shlex
import sys
from typing import Optional

import click

from .issue import issue_group
from .pr import pr_group
from .release import release_group
from .repo import repo_group
from .run import run_group
from .workflow import workflow_group
from .utils.gh_backend import DEFAULT_REPO, find_gh, normalize_output, run_gh, run_gh_json


# ── Main CLI Group ─────────────────────────────────────────────────────────────

@click.group()
@click.version_option(version="1.0.0", prog_name="cli-anything-gh")
@click.option("--repo", "-R", envvar="GITHUB_REPO", default=None,
              help="Default owner/repo for all commands")
@click.pass_context
def cli(ctx, repo):
    """
    CLI-Anything agent harness for GitHub CLI (gh).

    Wraps the gh binary with normalized JSON output, REPL mode,
    and agent-friendly interfaces optimized for ai-saas workflows.

    Default repo: invidias-codem/ai-saas (override via GITHUB_REPO env var)
    """
    ctx.ensure_object(dict)
    ctx.obj["repo"] = repo or DEFAULT_REPO


# Register command groups
cli.add_command(pr_group)
cli.add_command(issue_group)
cli.add_command(run_group)
cli.add_command(workflow_group)
cli.add_command(repo_group)
cli.add_command(release_group)


# ── status ─────────────────────────────────────────────────────────────────────

@cli.command("status")
@click.pass_context
def status(ctx):
    """Show harness configuration and gh auth status."""
    repo = ctx.obj.get("repo", DEFAULT_REPO)
    try:
        gh_path = find_gh()
    except RuntimeError as e:
        gh_path = f"ERROR: {e}"

    # Get gh version
    try:
        rc, stdout, stderr = run_gh(["--version"])
        version_line = stdout.strip().splitlines()[0] if stdout else "unknown"
    except Exception as e:
        version_line = f"error: {e}"

    # Get auth status
    try:
        rc, stdout, stderr = run_gh(["auth", "status"])
        auth_ok = rc == 0
        auth_info = stdout.strip() or stderr.strip()
    except Exception as e:
        auth_ok = False
        auth_info = str(e)

    result = {
        "ok": True,
        "harness": "cli-anything-gh",
        "version": "1.0.0",
        "gh_path": gh_path,
        "gh_version": version_line,
        "default_repo": repo,
        "env_repo": os.environ.get("GITHUB_REPO", "(not set)"),
        "auth_ok": auth_ok,
        "auth_info": auth_info,
    }
    click.echo(json.dumps(result, indent=2))


# ── api ────────────────────────────────────────────────────────────────────────

@cli.command("api")
@click.argument("endpoint")
@click.option("--method", "-X", default="GET",
              type=click.Choice(["GET", "POST", "PUT", "PATCH", "DELETE"]),
              help="HTTP method (default: GET)")
@click.option("--field", "-f", multiple=True, help="POST/PUT field in key=value format")
@click.option("--header", "-H", multiple=True, help="Additional HTTP headers")
@click.option("--paginate/--no-paginate", default=False, help="Fetch all pages")
@click.option("--jq", default=None, help="jq filter to apply")
@click.option("--input", "input_file", default=None, help="Read body from file")
def api_command(endpoint, method, field, header, paginate, jq, input_file):
    """Make a raw GitHub API request."""
    args = ["api", endpoint, "--method", method]
    for f in field:
        args += ["--field", f]
    for h in header:
        args += ["--header", h]
    if paginate:
        args.append("--paginate")
    if jq:
        args += ["--jq", jq]
    if input_file:
        args += ["--input", input_file]

    rc, stdout, stderr = run_gh(args)

    data = None
    if stdout.strip():
        try:
            data = json.loads(stdout)
        except json.JSONDecodeError:
            data = stdout

    click.echo(json.dumps(normalize_output(data, "api", endpoint, rc, stderr), indent=2))


# ── set-repo ───────────────────────────────────────────────────────────────────

@cli.command("set-repo")
@click.argument("repository")
def set_repo(repository):
    """Show how to set the default repository for your shell session."""
    result = {
        "ok": True,
        "instruction": f"Run: export GITHUB_REPO={repository}",
        "repository": repository,
        "note": "Or pass -R {repository} to individual commands",
    }
    click.echo(json.dumps(result, indent=2))


# ── repl ───────────────────────────────────────────────────────────────────────

@cli.command("repl")
@click.option("--repo", "-R", default=None,
              envvar="GITHUB_REPO",
              help="Default repo for REPL session (owner/repo)")
def repl(repo):
    """
    Start an interactive REPL with persistent repo context.

    The prompt shows the active repo: gh[invidias-codem/ai-saas]>
    Type 'help' for commands, 'exit' or Ctrl-D to quit.
    """
    active_repo = repo or DEFAULT_REPO
    _run_repl(active_repo)


def _run_repl(active_repo: str) -> None:
    """Main REPL loop."""
    click.echo(f"🐙 gh agent harness REPL — repo: {active_repo}")
    click.echo("  Commands: pr, issue, run, workflow, repo, release, api, status")
    click.echo("  set-repo OWNER/REPO  — change active repo")
    click.echo("  exit / quit / Ctrl-D — leave REPL\n")

    while True:
        try:
            prompt = f"gh[{active_repo}]> "
            line = click.prompt(prompt, prompt_suffix="", default="", show_default=False)
        except (click.Abort, EOFError, KeyboardInterrupt):
            click.echo("\nBye! 👋")
            break

        line = line.strip()
        if not line:
            continue

        if line in ("exit", "quit", "q"):
            click.echo("Bye! 👋")
            break

        if line == "help":
            _repl_help()
            continue

        # Handle set-repo
        if line.startswith("set-repo "):
            parts = line.split(None, 1)
            if len(parts) == 2:
                active_repo = parts[1].strip()
                click.echo(json.dumps({"ok": True, "active_repo": active_repo}, indent=2))
            else:
                click.echo(json.dumps({"ok": False, "error": "Usage: set-repo OWNER/REPO"}))
            continue

        # Parse and dispatch command
        try:
            args = shlex.split(line)
        except ValueError as e:
            click.echo(json.dumps({"ok": False, "error": f"Parse error: {e}"}))
            continue

        # Inject -R if not already present and it's a command that takes it
        if args and args[0] in ("pr", "issue", "run", "workflow", "repo", "release"):
            if "-R" not in args and "--repo" not in args:
                args = [args[0]] + ["-R", active_repo] + args[1:]

        # Run through Click CLI
        try:
            cli.main(args=args, standalone_mode=False, obj={"repo": active_repo})
        except SystemExit:
            pass
        except click.exceptions.UsageError as e:
            click.echo(json.dumps({"ok": False, "error": str(e)}))
        except Exception as e:
            click.echo(json.dumps({"ok": False, "error": str(e)}))


def _repl_help() -> None:
    """Print REPL help text."""
    help_text = {
        "commands": {
            "pr list": "List PRs [--state open|closed|merged|all] [--limit N]",
            "pr view NUMBER": "View a PR",
            "pr create --title T": "Create a PR",
            "pr merge NUMBER": "Merge a PR",
            "pr checks NUMBER": "Show CI status for PR",
            "pr diff NUMBER": "Show PR diff",
            "pr review NUMBER --approve": "Approve a PR",
            "pr comment NUMBER --body TEXT": "Comment on PR",
            "issue list": "List issues [--state open|closed|all] [--limit N]",
            "issue view NUMBER": "View an issue",
            "issue create --title T": "Create an issue",
            "issue close NUMBER": "Close an issue",
            "issue comment NUMBER --body TEXT": "Comment on issue",
            "run list": "List workflow runs [--workflow W] [--branch B]",
            "run view RUN_ID": "View a run",
            "run watch RUN_ID": "Watch a run until complete",
            "run logs RUN_ID": "View run logs",
            "run rerun RUN_ID": "Re-run a workflow",
            "workflow list": "List workflows",
            "workflow enable ID": "Enable a workflow",
            "workflow disable ID": "Disable a workflow",
            "workflow run ID": "Trigger a workflow",
            "repo view": "View current repo info",
            "repo list": "List repos for a user/org",
            "repo clone REPO": "Clone a repository",
            "repo fork REPO": "Fork a repository",
            "repo sync": "Sync repo with upstream",
            "release list": "List releases",
            "release view TAG": "View a release",
            "release create TAG --title T": "Create a release",
            "release upload TAG FILES...": "Upload assets to a release",
            "api ENDPOINT": "Raw API call",
            "set-repo OWNER/REPO": "Change active repository",
            "status": "Show harness status",
            "exit": "Leave REPL",
        }
    }
    click.echo(json.dumps(help_text, indent=2))


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    cli(obj={})


if __name__ == "__main__":
    main()
