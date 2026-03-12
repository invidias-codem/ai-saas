"""
gh_backend.py — Low-level subprocess wrapper for the GitHub CLI (gh).

Rules:
- NO shell=True anywhere
- find_gh() uses shutil.which; raises if not found
- run_gh() builds args list and runs via subprocess.run
- Smart JSON: auto-inject --json fields when the subcommand supports it
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any, List, Optional, Tuple

# ── Constants ──────────────────────────────────────────────────────────────────

DEFAULT_REPO = os.environ.get("GITHUB_REPO", "invidias-codem/ai-saas")

# Commands/sub-commands that support --json natively in gh
JSON_SUPPORT: dict[str, list[str]] = {
    "pr": [
        "additions", "assignees", "author", "autoMergeRequest", "baseRefName",
        "baseRefOid", "body", "changedFiles", "closed", "closedAt",
        "closingIssuesReferences", "comments", "commits", "createdAt",
        "deletions", "files", "fullDatabaseId", "headRefName", "headRefOid",
        "headRepository", "headRepositoryOwner", "id", "isCrossRepository",
        "isDraft", "labels", "latestReviews", "maintainerCanModify",
        "mergeCommit", "mergeStateStatus", "mergeable", "mergedAt", "mergedBy",
        "milestone", "number", "potentialMergeCommit", "projectCards",
        "projectItems", "reactionGroups", "reviewDecision", "reviewRequests",
        "reviews", "state", "statusCheckRollup", "title", "updatedAt", "url",
    ],
    "issue": [
        "assignees", "author", "body", "closed", "closedAt",
        "closedByPullRequestsReferences", "comments", "createdAt", "id",
        "isPinned", "labels", "milestone", "number", "projectCards",
        "projectItems", "reactionGroups", "state", "stateReason", "title",
        "updatedAt", "url",
    ],
    "run": [
        "attempt", "conclusion", "createdAt", "databaseId", "displayTitle",
        "event", "headBranch", "headSha", "name", "number", "startedAt",
        "status", "updatedAt", "url", "workflowDatabaseId", "workflowName",
    ],
    "workflow": ["id", "name", "path", "state"],
    "release": [
        "createdAt", "isDraft", "isImmutable", "isLatest", "isPrerelease",
        "name", "publishedAt", "tagName",
    ],
    "repo": [
        "archivedAt", "createdAt", "defaultBranchRef", "deleteBranchOnMerge",
        "description", "diskUsage", "forkCount", "hasIssuesEnabled",
        "hasProjectsEnabled", "hasWikiEnabled", "homepageUrl", "id",
        "isArchived", "isEmpty", "isFork", "isInOrganization", "isMirror",
        "isPrivate", "isTemplate", "labels", "languages", "latestRelease",
        "licenseInfo", "mergeCommitAllowed", "name", "nameWithOwner", "owner",
        "parent", "primaryLanguage", "pullRequests", "pushedAt",
        "rebaseMergeAllowed", "repositoryTopics", "squashMergeAllowed",
        "sshUrl", "stargazerCount", "updatedAt", "url", "viewerPermission",
        "visibility", "watchers",
    ],
}

# Default fields per command (agent-optimized subset)
DEFAULT_FIELDS: dict[str, list[str]] = {
    "pr": ["number", "title", "state", "author", "headRefName", "baseRefName",
           "isDraft", "reviewDecision", "mergeStateStatus", "url", "createdAt",
           "updatedAt", "labels", "assignees"],
    "issue": ["number", "title", "state", "author", "labels", "assignees",
              "createdAt", "updatedAt", "url", "milestone"],
    "run": ["databaseId", "name", "displayTitle", "status", "conclusion",
            "headBranch", "event", "createdAt", "updatedAt", "url",
            "workflowName"],
    "workflow": ["id", "name", "path", "state"],
    "release": ["tagName", "name", "isDraft", "isPrerelease", "isLatest",
                "publishedAt", "createdAt"],
    "repo": ["nameWithOwner", "description", "visibility", "isPrivate",
             "isFork", "isArchived", "defaultBranchRef", "primaryLanguage",
             "stargazerCount", "forkCount", "url", "pushedAt", "createdAt"],
}


# ── Core helpers ───────────────────────────────────────────────────────────────

def find_gh() -> str:
    """Return absolute path to gh binary; raise RuntimeError if not found."""
    path = shutil.which("gh")
    if path is None:
        raise RuntimeError(
            "GitHub CLI (gh) not found in PATH. "
            "Install from https://cli.github.com/"
        )
    return path


def build_repo_flag(repo: Optional[str]) -> list[str]:
    """Return [-R, owner/repo] or [] if no repo given."""
    if repo:
        return ["-R", repo]
    return []


def supports_json(command_group: str) -> bool:
    """Return True if this command group has known --json support."""
    return command_group in JSON_SUPPORT


def fields_for(command_group: str, fields: Optional[list[str]] = None) -> list[str]:
    """Return the field list to use for --json, using defaults if none given."""
    if fields:
        return fields
    return DEFAULT_FIELDS.get(command_group, [])


def run_gh(
    args: List[str],
    repo: Optional[str] = None,
    capture: bool = True,
    timeout: int = 60,
) -> Tuple[int, str, str]:
    """
    Run gh with the given args list.

    Args:
        args: Argument list (e.g. ['pr', 'list', '--state', 'open'])
        repo: Optional owner/repo to pass as -R flag
        capture: Whether to capture stdout/stderr (default True)
        timeout: Subprocess timeout in seconds

    Returns:
        (returncode, stdout, stderr)
    """
    gh_bin = find_gh()
    cmd = [gh_bin] + build_repo_flag(repo) + args

    result = subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
        timeout=timeout,
        # NO shell=True — ever
    )
    return result.returncode, result.stdout, result.stderr


def run_gh_json(
    args: List[str],
    command_group: str,
    repo: Optional[str] = None,
    fields: Optional[list[str]] = None,
    timeout: int = 60,
) -> Tuple[int, Any, str]:
    """
    Run gh command with --json support.

    If the command group supports --json and no --json flag is already in args,
    injects --json with the appropriate fields.

    Returns:
        (returncode, parsed_json_or_raw_text, stderr)
    """
    final_args = list(args)

    # Inject --json if supported and not already present
    if supports_json(command_group) and "--json" not in final_args:
        field_list = fields_for(command_group, fields)
        if field_list:
            final_args += ["--json", ",".join(field_list)]

    rc, stdout, stderr = run_gh(final_args, repo=repo, timeout=timeout)

    # Try to parse JSON
    if stdout.strip():
        try:
            return rc, json.loads(stdout), stderr
        except json.JSONDecodeError:
            pass

    return rc, stdout, stderr


def normalize_output(
    data: Any,
    command_group: str,
    subcommand: str,
    rc: int,
    stderr: str,
) -> dict:
    """
    Wrap gh output in a consistent envelope.

    {
        "ok": bool,
        "command": "pr.list",
        "repo": "...",
        "data": [...] | {...} | null,
        "error": "..." | null,
        "returncode": int
    }
    """
    return {
        "ok": rc == 0,
        "command": f"{command_group}.{subcommand}",
        "data": data if rc == 0 else None,
        "error": stderr.strip() if rc != 0 else None,
        "returncode": rc,
    }


def parse_table_lines(text: str, headers: list[str]) -> list[dict]:
    """
    Naively parse tab-separated or space-aligned table output into dicts.
    Used as fallback when --json is not available.
    """
    rows = []
    for line in text.strip().splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) >= len(headers):
            rows.append(dict(zip(headers, [p.strip() for p in parts])))
        else:
            # Try splitting by 2+ spaces
            parts = [p.strip() for p in line.split("  ") if p.strip()]
            if parts:
                row = {}
                for i, h in enumerate(headers):
                    row[h] = parts[i] if i < len(parts) else ""
                rows.append(row)
    return rows
