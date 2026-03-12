# cli-anything-gh

**CLI-Anything agent harness for GitHub CLI (`gh`)** — normalized JSON output, REPL mode, and agent-friendly interfaces optimized for the `invidias-codem/ai-saas` repository workflows.

## Overview

This harness wraps the real `gh` binary with:
- **Normalized JSON output** on every command via a consistent envelope
- **REPL mode** with persistent repo context prompt: `gh[invidias-codem/ai-saas]>`
- **Smart JSON injection** — uses `gh --json fields` where supported, parses text otherwise
- **Agent-friendly design** — consistent `{ ok, command, data, error, returncode }` structure
- **Zero shell=True** — all subprocess calls are safe

## Installation

```bash
# From the agent-harness directory:
pip install -e .

# Verify:
which cli-anything-gh
cli-anything-gh --help
```

## Quick Start

```bash
# Set default repo (or use GITHUB_REPO env var)
export GITHUB_REPO=invidias-codem/ai-saas

# List open PRs
cli-anything-gh pr list

# View an issue
cli-anything-gh issue view 42

# Start REPL
cli-anything-gh repl

# Check status
cli-anything-gh status
```

## Output Format

Every command returns a JSON envelope:

```json
{
  "ok": true,
  "command": "pr.list",
  "data": [...],
  "error": null,
  "returncode": 0
}
```

## Command Reference

### PR Commands
```bash
cli-anything-gh pr list [--state open|closed|merged|all] [--limit N] [--author LOGIN]
cli-anything-gh pr view <NUMBER>
cli-anything-gh pr create --title "Title" [--body "Body"] [--draft]
cli-anything-gh pr merge <NUMBER> [--squash|--merge|--rebase]
cli-anything-gh pr review <NUMBER> [--approve|--request-changes|--comment] [--body "text"]
cli-anything-gh pr checks <NUMBER>
cli-anything-gh pr diff <NUMBER>
cli-anything-gh pr comment <NUMBER> --body "text"
```

### Issue Commands
```bash
cli-anything-gh issue list [--state open|closed|all] [--label BUG] [--limit N]
cli-anything-gh issue view <NUMBER>
cli-anything-gh issue create --title "Title" [--body "Body"] [--label L]
cli-anything-gh issue close <NUMBER> [--reason completed]
cli-anything-gh issue reopen <NUMBER>
cli-anything-gh issue comment <NUMBER> --body "text"
cli-anything-gh issue edit <NUMBER> [--title T] [--add-label L]
```

### Run (Actions) Commands
```bash
cli-anything-gh run list [--workflow W] [--branch B] [--status S]
cli-anything-gh run view <RUN_ID>
cli-anything-gh run watch <RUN_ID>
cli-anything-gh run logs <RUN_ID>
cli-anything-gh run rerun <RUN_ID> [--failed-only]
cli-anything-gh run cancel <RUN_ID>
```

### Workflow Commands
```bash
cli-anything-gh workflow list [--all]
cli-anything-gh workflow view <ID>
cli-anything-gh workflow enable <ID>
cli-anything-gh workflow disable <ID>
cli-anything-gh workflow run <ID> [--ref BRANCH] [--field key=value]
```

### Repo Commands
```bash
cli-anything-gh repo view [REPO]
cli-anything-gh repo list [OWNER] [--limit N]
cli-anything-gh repo clone <REPO> [DIRECTORY]
cli-anything-gh repo fork [REPO] [--clone]
cli-anything-gh repo sync [REPO] [--branch B] [--force]
```

### Release Commands
```bash
cli-anything-gh release list [--limit N]
cli-anything-gh release view [TAG]
cli-anything-gh release create <TAG> --title "Title" [--draft] [--prerelease]
cli-anything-gh release upload <TAG> <FILES...>
cli-anything-gh release delete <TAG> --yes
```

### Utility Commands
```bash
cli-anything-gh api <ENDPOINT> [--method GET|POST|...] [--field key=value]
cli-anything-gh status
cli-anything-gh set-repo OWNER/REPO
cli-anything-gh repl [--repo OWNER/REPO]
```

## REPL Mode

```
$ cli-anything-gh repl
🐙 gh agent harness REPL — repo: invidias-codem/ai-saas
  Commands: pr, issue, run, workflow, repo, release, api, status
  set-repo OWNER/REPO  — change active repo
  exit / quit / Ctrl-D — leave REPL

gh[invidias-codem/ai-saas]> pr list --limit 5
{
  "ok": true,
  "command": "pr.list",
  "data": [...],
  ...
}

gh[invidias-codem/ai-saas]> set-repo octocat/hello-world
{"ok": true, "active_repo": "octocat/hello-world"}

gh[octocat/hello-world]> exit
Bye! 👋
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_REPO` | `invidias-codem/ai-saas` | Default repository |
| `GH_TOKEN` | (from gh auth) | GitHub token for API calls |

## Architecture

```
cli_anything/gh/
├── gh_cli.py          # Main Click CLI + REPL
├── pr.py              # PR commands
├── issue.py           # Issue commands
├── run.py             # Actions run commands
├── workflow.py        # Workflow commands
├── repo.py            # Repository commands
├── release.py         # Release commands
└── utils/
    └── gh_backend.py  # subprocess wrapper, JSON normalization
```

## Testing

```bash
# Unit tests (no auth required):
pytest tests/test_core.py -v

# E2E tests (requires GH_TOKEN):
GH_TOKEN=<token> pytest tests/test_full_e2e.py -v

# All tests:
GH_TOKEN=<token> pytest -v
```

## Safety

- **NO `shell=True`** anywhere — all subprocess calls use list args
- Credentials via `gh auth login` or `GITHUB_TOKEN` env — never hardcoded
- Default repo configurable via `GITHUB_REPO` env var
