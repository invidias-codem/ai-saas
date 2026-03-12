"""
test_full_e2e.py — End-to-end tests for the gh agent harness.

Tests that make live API calls are gated on GH_TOKEN env var.

Run with auth:  GH_TOKEN=<token> pytest tests/test_full_e2e.py -v
Run without:    pytest tests/test_full_e2e.py -v  (skips auth tests)
"""

from __future__ import annotations

import json
import os
import pytest
from click.testing import CliRunner

from cli_anything.gh.gh_cli import cli
from cli_anything.gh.utils.gh_backend import DEFAULT_REPO, find_gh

# ── Fixtures ──────────────────────────────────────────────────────────────────

GH_TOKEN = os.environ.get("GH_TOKEN")
requires_gh_token = pytest.mark.skipif(
    not GH_TOKEN,
    reason="requires GH_TOKEN environment variable for live GitHub API calls"
)

TEST_REPO = os.environ.get("GH_TEST_REPO", DEFAULT_REPO)


@pytest.fixture
def runner():
    return CliRunner()


# ── Binary / installation tests ───────────────────────────────────────────────

class TestGhBinaryInstalled:

    def test_gh_binary_exists(self):
        """gh must be installed and findable."""
        path = find_gh()
        assert path is not None
        assert "gh" in path

    def test_gh_binary_is_executable(self):
        """gh binary must be executable."""
        import shutil
        path = shutil.which("gh")
        assert path is not None
        assert os.access(path, os.X_OK)


# ── CLI invocation (no auth needed) ──────────────────────────────────────────

class TestCliInvocation:

    def test_help_exits_zero(self, runner):
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "GitHub" in result.output or "harness" in result.output.lower()

    def test_version_flag(self, runner):
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "1.0.0" in result.output

    def test_pr_help(self, runner):
        result = runner.invoke(cli, ["pr", "--help"])
        assert result.exit_code == 0
        assert "list" in result.output

    def test_issue_help(self, runner):
        result = runner.invoke(cli, ["issue", "--help"])
        assert result.exit_code == 0
        assert "create" in result.output

    def test_run_help(self, runner):
        result = runner.invoke(cli, ["run", "--help"])
        assert result.exit_code == 0

    def test_workflow_help(self, runner):
        result = runner.invoke(cli, ["workflow", "--help"])
        assert result.exit_code == 0

    def test_repo_help(self, runner):
        result = runner.invoke(cli, ["repo", "--help"])
        assert result.exit_code == 0

    def test_release_help(self, runner):
        result = runner.invoke(cli, ["release", "--help"])
        assert result.exit_code == 0

    def test_set_repo_command(self, runner):
        result = runner.invoke(cli, ["set-repo", "testorg/testrepo"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["ok"] is True
        assert data["repository"] == "testorg/testrepo"
        assert "export GITHUB_REPO=testorg/testrepo" in data["instruction"]


# ── Auth-gated tests ──────────────────────────────────────────────────────────

@requires_gh_token
class TestStatusWithAuth:

    def test_status_command(self, runner):
        result = runner.invoke(cli, ["status"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["ok"] is True
        assert data["auth_ok"] is True
        assert "gh_path" in data
        assert "default_repo" in data

    def test_status_shows_version(self, runner):
        result = runner.invoke(cli, ["status"])
        data = json.loads(result.output)
        assert "gh_version" in data
        assert "gh version" in data["gh_version"]


@requires_gh_token
class TestPrListE2E:

    def test_pr_list_returns_json_envelope(self, runner):
        result = runner.invoke(cli, ["pr", "list", "-R", TEST_REPO])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["command"] == "pr.list"
        assert "ok" in data
        assert "data" in data

    def test_pr_list_data_is_list(self, runner):
        result = runner.invoke(cli, ["pr", "list", "-R", TEST_REPO,
                                      "--state", "all", "--limit", "5"])
        data = json.loads(result.output)
        if data["ok"]:
            assert isinstance(data["data"], list)

    def test_pr_list_state_open(self, runner):
        result = runner.invoke(cli, ["pr", "list", "-R", TEST_REPO,
                                      "--state", "open", "--limit", "10"])
        data = json.loads(result.output)
        assert data["command"] == "pr.list"
        # If data present, each item should have expected fields
        if data["ok"] and data["data"]:
            for pr in data["data"]:
                assert "number" in pr
                assert "title" in pr

    def test_pr_list_with_limit(self, runner):
        result = runner.invoke(cli, ["pr", "list", "-R", TEST_REPO,
                                      "--limit", "3", "--state", "all"])
        data = json.loads(result.output)
        if data["ok"] and data["data"]:
            assert len(data["data"]) <= 3


@requires_gh_token
class TestIssueListE2E:

    def test_issue_list_returns_json_envelope(self, runner):
        result = runner.invoke(cli, ["issue", "list", "-R", TEST_REPO])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["command"] == "issue.list"
        assert "ok" in data

    def test_issue_list_with_state_closed(self, runner):
        result = runner.invoke(cli, ["issue", "list", "-R", TEST_REPO,
                                      "--state", "closed", "--limit", "5"])
        data = json.loads(result.output)
        assert data["command"] == "issue.list"

    def test_issue_list_fields_present(self, runner):
        result = runner.invoke(cli, ["issue", "list", "-R", TEST_REPO,
                                      "--limit", "3"])
        data = json.loads(result.output)
        if data["ok"] and data["data"]:
            for issue in data["data"]:
                assert "number" in issue
                assert "title" in issue
                assert "state" in issue


@requires_gh_token
class TestRunListE2E:

    def test_run_list_returns_json(self, runner):
        result = runner.invoke(cli, ["run", "list", "-R", TEST_REPO, "--limit", "5"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["command"] == "run.list"
        assert "ok" in data

    def test_run_list_with_branch(self, runner):
        result = runner.invoke(cli, ["run", "list", "-R", TEST_REPO,
                                      "--branch", "main", "--limit", "5"])
        data = json.loads(result.output)
        assert data["command"] == "run.list"


@requires_gh_token
class TestWorkflowListE2E:

    def test_workflow_list_returns_json(self, runner):
        result = runner.invoke(cli, ["workflow", "list", "-R", TEST_REPO])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["command"] == "workflow.list"

    def test_workflow_list_fields(self, runner):
        result = runner.invoke(cli, ["workflow", "list", "-R", TEST_REPO])
        data = json.loads(result.output)
        if data["ok"] and data["data"]:
            for wf in data["data"]:
                assert "name" in wf
                assert "state" in wf


@requires_gh_token
class TestRepoViewE2E:

    def test_repo_view_returns_json(self, runner):
        result = runner.invoke(cli, ["repo", "view", TEST_REPO])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["command"] == "repo.view"
        assert "ok" in data

    def test_repo_view_has_expected_fields(self, runner):
        result = runner.invoke(cli, ["repo", "view", TEST_REPO])
        data = json.loads(result.output)
        if data["ok"]:
            repo = data["data"]
            assert "nameWithOwner" in repo or "name" in repo


@requires_gh_token
class TestReleaseListE2E:

    def test_release_list_returns_json(self, runner):
        result = runner.invoke(cli, ["release", "list", "-R", TEST_REPO])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["command"] == "release.list"


@requires_gh_token
class TestApiCommandE2E:

    def test_api_get_repo(self, runner):
        owner, repo = TEST_REPO.split("/", 1)
        result = runner.invoke(cli, ["api", f"repos/{owner}/{repo}"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "ok" in data
        # If successful, should have repo data
        if data["ok"]:
            assert isinstance(data["data"], dict)

    def test_api_rate_limit(self, runner):
        result = runner.invoke(cli, ["api", "rate_limit"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["ok"] is True
        if data["data"]:
            assert "resources" in data["data"] or "rate" in data["data"]


# ── Output shape invariants ───────────────────────────────────────────────────

@requires_gh_token
class TestOutputShapeInvariants:
    """Every command must return a valid JSON envelope with required keys."""

    REQUIRED_KEYS = {"ok", "command", "data", "returncode"}

    @pytest.mark.parametrize("cmd_args", [
        ["pr", "list", "--limit", "1", "--state", "all"],
        ["issue", "list", "--limit", "1", "--state", "all"],
        ["run", "list", "--limit", "1"],
        ["workflow", "list", "--limit", "5"],
        ["release", "list", "--limit", "1"],
    ])
    def test_envelope_shape(self, runner, cmd_args):
        result = runner.invoke(cli, cmd_args + ["-R", TEST_REPO])
        assert result.exit_code == 0, f"Command {cmd_args} failed: {result.output}"
        try:
            data = json.loads(result.output)
        except json.JSONDecodeError:
            pytest.fail(f"Output is not valid JSON: {result.output[:500]}")

        for key in self.REQUIRED_KEYS:
            assert key in data, f"Missing key '{key}' in output for {cmd_args}"

        assert isinstance(data["ok"], bool)
        assert isinstance(data["returncode"], int)
