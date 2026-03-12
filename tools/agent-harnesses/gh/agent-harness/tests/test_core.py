"""
test_core.py — Unit tests for the gh agent harness.

These tests run WITHOUT live GitHub auth or network access.
All subprocess calls are mocked.

Run: pytest tests/test_core.py -v
"""

from __future__ import annotations

import json
import os
import shutil
import unittest
from unittest.mock import MagicMock, patch, call
from click.testing import CliRunner

# ── Harness imports ───────────────────────────────────────────────────────────
from cli_anything.gh.utils.gh_backend import (
    DEFAULT_REPO,
    build_repo_flag,
    fields_for,
    find_gh,
    normalize_output,
    parse_table_lines,
    run_gh,
    run_gh_json,
    supports_json,
    JSON_SUPPORT,
    DEFAULT_FIELDS,
)
from cli_anything.gh.gh_cli import cli
from cli_anything.gh.pr import pr_group, _parse_checks_output
from cli_anything.gh.repo import _parse_repo_list


# ─────────────────────────────────────────────────────────────────────────────
# Backend: find_gh
# ─────────────────────────────────────────────────────────────────────────────

class TestFindGh(unittest.TestCase):

    def test_find_gh_returns_path_when_found(self):
        with patch("shutil.which", return_value="/usr/local/bin/gh"):
            result = find_gh()
        self.assertEqual(result, "/usr/local/bin/gh")

    def test_find_gh_raises_when_not_found(self):
        with patch("shutil.which", return_value=None):
            with self.assertRaises(RuntimeError) as ctx:
                find_gh()
        self.assertIn("not found", str(ctx.exception))

    def test_find_gh_uses_shutil_which(self):
        with patch("shutil.which") as mock_which:
            mock_which.return_value = "/usr/bin/gh"
            find_gh()
            mock_which.assert_called_once_with("gh")


# ─────────────────────────────────────────────────────────────────────────────
# Backend: build_repo_flag
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildRepoFlag(unittest.TestCase):

    def test_returns_flag_list_when_repo_given(self):
        self.assertEqual(build_repo_flag("owner/repo"), ["-R", "owner/repo"])

    def test_returns_empty_when_none(self):
        self.assertEqual(build_repo_flag(None), [])

    def test_returns_empty_when_empty_string(self):
        self.assertEqual(build_repo_flag(""), [])


# ─────────────────────────────────────────────────────────────────────────────
# Backend: supports_json / fields_for
# ─────────────────────────────────────────────────────────────────────────────

class TestJsonSupport(unittest.TestCase):

    def test_supports_json_for_known_groups(self):
        for group in ("pr", "issue", "run", "workflow", "release", "repo"):
            self.assertTrue(supports_json(group), f"{group} should support JSON")

    def test_does_not_support_json_for_unknown(self):
        self.assertFalse(supports_json("unknown_command"))
        self.assertFalse(supports_json(""))

    def test_fields_for_returns_defaults(self):
        fields = fields_for("pr")
        self.assertIsInstance(fields, list)
        self.assertIn("number", fields)
        self.assertIn("title", fields)
        self.assertIn("state", fields)

    def test_fields_for_returns_custom_when_given(self):
        custom = ["number", "title"]
        result = fields_for("pr", custom)
        self.assertEqual(result, custom)

    def test_fields_for_unknown_group_returns_empty(self):
        result = fields_for("unknown_group")
        self.assertEqual(result, [])

    def test_default_fields_all_valid(self):
        for group, flds in DEFAULT_FIELDS.items():
            valid = JSON_SUPPORT.get(group, [])
            for f in flds:
                self.assertIn(f, valid,
                              f"Field '{f}' in DEFAULT_FIELDS['{group}'] not in JSON_SUPPORT")


# ─────────────────────────────────────────────────────────────────────────────
# Backend: normalize_output
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeOutput(unittest.TestCase):

    def test_ok_when_rc_zero(self):
        result = normalize_output({"foo": "bar"}, "pr", "list", 0, "")
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"], {"foo": "bar"})
        self.assertIsNone(result["error"])
        self.assertEqual(result["command"], "pr.list")

    def test_not_ok_when_rc_nonzero(self):
        result = normalize_output(None, "pr", "list", 1, "auth error")
        self.assertFalse(result["ok"])
        self.assertIsNone(result["data"])
        self.assertEqual(result["error"], "auth error")

    def test_returncode_preserved(self):
        result = normalize_output(None, "issue", "view", 128, "fatal")
        self.assertEqual(result["returncode"], 128)

    def test_command_format(self):
        result = normalize_output({}, "workflow", "enable", 0, "")
        self.assertEqual(result["command"], "workflow.enable")

    def test_data_null_on_failure(self):
        result = normalize_output(["some", "data"], "run", "list", 1, "err")
        self.assertIsNone(result["data"])


# ─────────────────────────────────────────────────────────────────────────────
# Backend: run_gh (subprocess mocked)
# ─────────────────────────────────────────────────────────────────────────────

class TestRunGh(unittest.TestCase):

    def _make_result(self, rc=0, stdout="", stderr=""):
        m = MagicMock()
        m.returncode = rc
        m.stdout = stdout
        m.stderr = stderr
        return m

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_basic(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "output", "")
        rc, stdout, stderr = run_gh(["pr", "list"])
        self.assertEqual(rc, 0)
        self.assertEqual(stdout, "output")
        mock_run.assert_called_once()
        # Verify NO shell=True
        call_kwargs = mock_run.call_args[1]
        self.assertNotIn("shell", call_kwargs)
        # Or if shell is in kwargs, it must be False
        self.assertFalse(call_kwargs.get("shell", False))

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_with_repo(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "[]", "")
        run_gh(["pr", "list"], repo="owner/repo")
        cmd = mock_run.call_args[0][0]
        self.assertIn("-R", cmd)
        self.assertIn("owner/repo", cmd)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_no_shell_true(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "", "")
        run_gh(["--version"])
        call_kwargs = mock_run.call_args[1]
        # shell must NOT be True
        self.assertFalse(call_kwargs.get("shell", False))

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_propagates_return_code(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(1, "", "error")
        rc, stdout, stderr = run_gh(["pr", "view", "1"])
        self.assertEqual(rc, 1)
        self.assertEqual(stderr, "error")

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_uses_text_mode(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "", "")
        run_gh(["pr", "list"])
        call_kwargs = mock_run.call_args[1]
        self.assertTrue(call_kwargs.get("text", False))


# ─────────────────────────────────────────────────────────────────────────────
# Backend: run_gh_json
# ─────────────────────────────────────────────────────────────────────────────

class TestRunGhJson(unittest.TestCase):

    def _make_result(self, rc=0, stdout="", stderr=""):
        m = MagicMock()
        m.returncode = rc
        m.stdout = stdout
        m.stderr = stderr
        return m

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_injects_json_flag(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "[]", "")
        run_gh_json(["pr", "list"], "pr")
        cmd = mock_run.call_args[0][0]
        self.assertIn("--json", cmd)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_parses_json_output(self, mock_which, mock_run):
        sample = [{"number": 1, "title": "Test PR"}]
        mock_run.return_value = self._make_result(0, json.dumps(sample), "")
        rc, data, stderr = run_gh_json(["pr", "list"], "pr")
        self.assertEqual(rc, 0)
        self.assertEqual(data, sample)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_does_not_double_inject_json(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "[]", "")
        run_gh_json(["pr", "list", "--json", "number,title"], "pr")
        cmd = mock_run.call_args[0][0]
        # --json should appear exactly once
        self.assertEqual(cmd.count("--json"), 1)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_falls_back_to_raw_on_bad_json(self, mock_which, mock_run):
        mock_run.return_value = self._make_result(0, "not json at all", "")
        rc, data, stderr = run_gh_json(["pr", "checks", "1"], "pr")
        self.assertEqual(rc, 0)
        self.assertEqual(data, "not json at all")


# ─────────────────────────────────────────────────────────────────────────────
# Backend: parse_table_lines
# ─────────────────────────────────────────────────────────────────────────────

class TestParseTableLines(unittest.TestCase):

    def test_tab_separated(self):
        text = "owner/repo\tdescription\tpublic\t2024-01-01"
        result = parse_table_lines(text, ["nameWithOwner", "description", "visibility", "updatedAt"])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["nameWithOwner"], "owner/repo")

    def test_empty_input(self):
        result = parse_table_lines("", ["a", "b"])
        self.assertEqual(result, [])

    def test_multiple_rows(self):
        text = "a\tb\nc\td"
        result = parse_table_lines(text, ["x", "y"])
        self.assertEqual(len(result), 2)


# ─────────────────────────────────────────────────────────────────────────────
# PR helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestParseChecksOutput(unittest.TestCase):

    def test_parses_basic_checks(self):
        text = "ci/test\tpass\tsuccess\thttps://example.com\nci/lint\tfail\tfailure\t"
        checks = _parse_checks_output(text)
        self.assertEqual(len(checks), 2)
        self.assertEqual(checks[0]["name"], "ci/test")
        self.assertEqual(checks[0]["status"], "pass")
        self.assertEqual(checks[1]["name"], "ci/lint")

    def test_empty_returns_empty_list(self):
        self.assertEqual(_parse_checks_output(""), [])

    def test_partial_line(self):
        text = "ci/test\tpass"
        checks = _parse_checks_output(text)
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0]["name"], "ci/test")


# ─────────────────────────────────────────────────────────────────────────────
# Repo helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestParseRepoList(unittest.TestCase):

    def test_parses_repo_list(self):
        text = (
            "invidias-codem/ai-saas\tAI SaaS platform\tprivate\t2024-01-15\n"
            "invidias-codem/other-repo\tAnother repo\tpublic\t2024-01-10"
        )
        repos = _parse_repo_list(text)
        self.assertEqual(len(repos), 2)
        self.assertEqual(repos[0]["nameWithOwner"], "invidias-codem/ai-saas")
        self.assertEqual(repos[0]["visibility"], "private")

    def test_empty_returns_empty_list(self):
        self.assertEqual(_parse_repo_list(""), [])


# ─────────────────────────────────────────────────────────────────────────────
# CLI: Click runner tests (no subprocess calls)
# ─────────────────────────────────────────────────────────────────────────────

class TestCliStatus(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_status_returns_json(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout="gh version 2.86.0\n",
                                          stderr="")
        result = self.runner.invoke(cli, ["status"])
        self.assertEqual(result.exit_code, 0)
        data = json.loads(result.output)
        self.assertIn("gh_path", data)
        self.assertIn("default_repo", data)
        self.assertIn("harness", data)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_status_includes_version(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout="gh version 2.86.0 (2024-01-01)\n",
                                          stderr="")
        result = self.runner.invoke(cli, ["status"])
        data = json.loads(result.output)
        self.assertIn("gh_version", data)


class TestCliPr(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_pr_list_outputs_json_envelope(self, mock_which, mock_run):
        sample = [{"number": 1, "title": "Fix bug", "state": "OPEN"}]
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["pr", "list"])
        self.assertEqual(result.exit_code, 0)
        data = json.loads(result.output)
        self.assertIn("ok", data)
        self.assertIn("command", data)
        self.assertIn("data", data)
        self.assertEqual(data["command"], "pr.list")

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_pr_list_with_state_flag(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="[]", stderr="")
        result = self.runner.invoke(cli, ["pr", "list", "--state", "closed"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("closed", cmd)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_pr_view_passes_number(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=json.dumps({"number": 42, "title": "Test"}),
            stderr=""
        )
        result = self.runner.invoke(cli, ["pr", "view", "42"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("42", cmd)
        data = json.loads(result.output)
        self.assertEqual(data["command"], "pr.view")

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_pr_list_injects_repo(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="[]", stderr="")
        result = self.runner.invoke(cli, ["pr", "list", "-R", "myorg/myrepo"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("-R", cmd)
        self.assertIn("myorg/myrepo", cmd)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_pr_create_requires_title(self, mock_which, mock_run):
        result = self.runner.invoke(cli, ["pr", "create"])
        self.assertNotEqual(result.exit_code, 0)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_pr_error_shows_not_ok(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="auth error")
        result = self.runner.invoke(cli, ["pr", "list"])
        data = json.loads(result.output)
        self.assertFalse(data["ok"])
        self.assertEqual(data["error"], "auth error")


class TestCliIssue(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_issue_list_json_envelope(self, mock_which, mock_run):
        sample = [{"number": 5, "title": "Bug report", "state": "OPEN"}]
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["issue", "list"])
        data = json.loads(result.output)
        self.assertEqual(data["command"], "issue.list")
        self.assertTrue(data["ok"])

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_issue_close_passes_number(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        result = self.runner.invoke(cli, ["issue", "close", "99"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("99", cmd)
        self.assertIn("close", cmd)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_issue_create_title_required(self, mock_which, mock_run):
        result = self.runner.invoke(cli, ["issue", "create"])
        self.assertNotEqual(result.exit_code, 0)

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_issue_create_with_title(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="https://github.com/owner/repo/issues/5\n",
            stderr=""
        )
        result = self.runner.invoke(cli, ["issue", "create", "--title", "New bug"])
        data = json.loads(result.output)
        self.assertTrue(data["ok"])
        self.assertIn("url", data["data"])


class TestCliRun(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_list_json_envelope(self, mock_which, mock_run):
        sample = [{"databaseId": 123, "status": "completed"}]
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["run", "list"])
        data = json.loads(result.output)
        self.assertEqual(data["command"], "run.list")

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_rerun_with_failed_flag(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        result = self.runner.invoke(cli, ["run", "rerun", "456", "--failed-only"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("--failed", cmd)


class TestCliWorkflow(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_workflow_list_json(self, mock_which, mock_run):
        sample = [{"id": 1, "name": "CI", "state": "active"}]
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["workflow", "list"])
        data = json.loads(result.output)
        self.assertEqual(data["command"], "workflow.list")
        self.assertTrue(data["ok"])

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_workflow_enable_calls_enable(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        result = self.runner.invoke(cli, ["workflow", "enable", "ci.yml"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("enable", cmd)
        self.assertIn("ci.yml", cmd)


class TestCliRepo(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_repo_view_json(self, mock_which, mock_run):
        sample = {"nameWithOwner": "owner/repo", "description": "test"}
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["repo", "view"])
        data = json.loads(result.output)
        self.assertEqual(data["command"], "repo.view")

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_repo_sync_uses_default_repo(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="synced\n", stderr="")
        result = self.runner.invoke(cli, ["repo", "sync"])
        cmd = mock_run.call_args[0][0]
        # Should include DEFAULT_REPO in args
        self.assertIn(DEFAULT_REPO, cmd)


class TestCliRelease(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_release_list_json(self, mock_which, mock_run):
        sample = [{"tagName": "v1.0.0", "isLatest": True}]
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["release", "list"])
        data = json.loads(result.output)
        self.assertEqual(data["command"], "release.list")
        self.assertTrue(data["ok"])


class TestDefaultRepo(unittest.TestCase):

    def test_default_repo_is_ai_saas(self):
        """Default repo must be invidias-codem/ai-saas unless overridden."""
        # Save current env
        saved = os.environ.pop("GITHUB_REPO", None)
        try:
            import importlib
            import cli_anything.gh.utils.gh_backend as backend
            importlib.reload(backend)
            self.assertEqual(backend.DEFAULT_REPO, "invidias-codem/ai-saas")
        finally:
            if saved:
                os.environ["GITHUB_REPO"] = saved

    def test_default_repo_overridable_by_env(self):
        os.environ["GITHUB_REPO"] = "myorg/myrepo"
        try:
            import importlib
            import cli_anything.gh.utils.gh_backend as backend
            importlib.reload(backend)
            self.assertEqual(backend.DEFAULT_REPO, "myorg/myrepo")
        finally:
            os.environ.pop("GITHUB_REPO", None)
            import importlib
            import cli_anything.gh.utils.gh_backend as backend
            importlib.reload(backend)


class TestNoShellTrue(unittest.TestCase):
    """Verify shell=True is never passed to subprocess.run."""

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_never_uses_shell(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        run_gh(["pr", "list"])
        for c in mock_run.call_args_list:
            self.assertFalse(c[1].get("shell", False),
                             "shell=True detected in subprocess.run call!")

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_run_gh_json_never_uses_shell(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="[]", stderr="")
        run_gh_json(["issue", "list"], "issue")
        for c in mock_run.call_args_list:
            self.assertFalse(c[1].get("shell", False),
                             "shell=True detected in run_gh_json!")


class TestApiCommand(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_api_get_request(self, mock_which, mock_run):
        sample = {"id": 1, "name": "ai-saas"}
        mock_run.return_value = MagicMock(returncode=0,
                                          stdout=json.dumps(sample),
                                          stderr="")
        result = self.runner.invoke(cli, ["api", "repos/invidias-codem/ai-saas"])
        data = json.loads(result.output)
        self.assertEqual(data["command"], "api.repos/invidias-codem/ai-saas")
        self.assertTrue(data["ok"])

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/local/bin/gh")
    def test_api_uses_method_flag(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="{}", stderr="")
        result = self.runner.invoke(cli, ["api", "repos/test", "--method", "POST"])
        cmd = mock_run.call_args[0][0]
        self.assertIn("POST", cmd)


class TestSetRepo(unittest.TestCase):

    def setUp(self):
        self.runner = CliRunner()

    def test_set_repo_returns_instruction(self):
        result = self.runner.invoke(cli, ["set-repo", "myorg/myrepo"])
        data = json.loads(result.output)
        self.assertTrue(data["ok"])
        self.assertIn("myorg/myrepo", data["instruction"])
        self.assertEqual(data["repository"], "myorg/myrepo")


if __name__ == "__main__":
    unittest.main(verbosity=2)
