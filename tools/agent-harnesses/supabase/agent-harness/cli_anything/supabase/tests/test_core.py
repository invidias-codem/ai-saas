"""
test_core.py — Unit tests for CLI-Anything: Supabase harness.

All tests run without external dependencies (supabase binary, network, etc.)
using unittest.mock to patch subprocess.run and shutil.which.

Run:
    python3 -m pytest cli_anything/supabase/tests/test_core.py -v
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest
from click.testing import CliRunner

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _make_completed(
    stdout: str = "",
    stderr: str = "",
    returncode: int = 0,
) -> MagicMock:
    """Return a mock subprocess.CompletedProcess."""
    cp = MagicMock()
    cp.stdout = stdout
    cp.stderr = stderr
    cp.returncode = returncode
    return cp


FAKE_BINARY = "/usr/local/bin/supabase"


# ──────────────────────────────────────────────────────────────────────────────
# 1–15: Backend tests
# ──────────────────────────────────────────────────────────────────────────────

class TestFindSupabase:
    @patch("shutil.which", return_value=FAKE_BINARY)
    def test_find_supabase_returns_path(self, mock_which):
        from cli_anything.supabase.utils.supabase_backend import find_supabase
        assert find_supabase() == FAKE_BINARY

    @patch("shutil.which", return_value=None)
    def test_find_supabase_raises_when_missing(self, mock_which):
        from cli_anything.supabase.utils.supabase_backend import find_supabase
        with pytest.raises(RuntimeError, match="Supabase CLI not found"):
            find_supabase()


class TestSupabaseResult:
    def _make_result(self, stdout="", stderr="", returncode=0):
        from cli_anything.supabase.utils.supabase_backend import SupabaseResult
        return SupabaseResult(
            args=[FAKE_BINARY, "db", "push"],
            returncode=returncode,
            stdout=stdout,
            stderr=stderr,
        )

    def test_success_true(self):
        r = self._make_result(returncode=0)
        assert r.success is True

    def test_success_false(self):
        r = self._make_result(returncode=1)
        assert r.success is False

    def test_command_property(self):
        r = self._make_result()
        assert r.command == "db push"

    def test_parsed_valid_json(self):
        r = self._make_result(stdout='[{"id":"abc"}]')
        assert r.parsed() == [{"id": "abc"}]

    def test_parsed_invalid_json(self):
        r = self._make_result(stdout="not json")
        assert r.parsed() is None

    def test_parsed_empty_stdout(self):
        r = self._make_result(stdout="")
        assert r.parsed() is None

    def test_to_dict_keys(self):
        r = self._make_result(stdout='{"ok":true}')
        d = r.to_dict()
        assert "success" in d
        assert "command" in d
        assert "returncode" in d
        assert "stdout" in d
        assert "stderr" in d
        assert "data" in d

    def test_to_dict_data_is_parsed(self):
        r = self._make_result(stdout='{"val":42}')
        assert r.to_dict()["data"] == {"val": 42}

    def test_to_dict_success_true(self):
        r = self._make_result(returncode=0)
        assert r.to_dict()["success"] is True

    def test_to_dict_success_false(self):
        r = self._make_result(returncode=2)
        assert r.to_dict()["success"] is False


class TestRunSupabase:
    @patch("shutil.which", return_value=FAKE_BINARY)
    @patch("subprocess.run")
    def test_no_shell_true(self, mock_run, mock_which):
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        mock_run.return_value = _make_completed()
        run_supabase(["--version"])
        _call = mock_run.call_args
        # shell should not be in kwargs, or should be False
        assert not _call.kwargs.get("shell", False)

    @patch("shutil.which", return_value=FAKE_BINARY)
    @patch("subprocess.run")
    def test_args_are_list(self, mock_run, mock_which):
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        mock_run.return_value = _make_completed()
        run_supabase(["db", "push"])
        cmd = mock_run.call_args.args[0]
        assert isinstance(cmd, list)
        assert cmd[0] == FAKE_BINARY

    @patch("shutil.which", return_value=FAKE_BINARY)
    @patch("subprocess.run")
    def test_captures_stdout(self, mock_run, mock_which):
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        mock_run.return_value = _make_completed(stdout="hello")
        result = run_supabase(["--version"])
        assert result.stdout == "hello"

    @patch("shutil.which", return_value=FAKE_BINARY)
    @patch("subprocess.run")
    def test_captures_stderr(self, mock_run, mock_which):
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        mock_run.return_value = _make_completed(stderr="oops")
        result = run_supabase(["--version"])
        assert result.stderr == "oops"

    @patch("shutil.which", return_value=FAKE_BINARY)
    @patch("subprocess.run")
    def test_run_supabase_json_appends_output_flag(self, mock_run, mock_which):
        from cli_anything.supabase.utils.supabase_backend import run_supabase_json
        mock_run.return_value = _make_completed()
        run_supabase_json(["projects", "list"])
        cmd = mock_run.call_args.args[0]
        assert "--output" in cmd
        assert "json" in cmd

    @patch("shutil.which", return_value=FAKE_BINARY)
    @patch("subprocess.run")
    def test_run_supabase_json_no_duplicate_flag(self, mock_run, mock_which):
        from cli_anything.supabase.utils.supabase_backend import run_supabase_json
        mock_run.return_value = _make_completed()
        run_supabase_json(["projects", "list", "--output", "json"])
        cmd = mock_run.call_args.args[0]
        assert cmd.count("--output") == 1


# ──────────────────────────────────────────────────────────────────────────────
# 16–27: Project command tests
# ──────────────────────────────────────────────────────────────────────────────

class TestProjectCommands:
    def setup_method(self):
        self.runner = CliRunner()

    def _mock_run(self, stdout="", returncode=0):
        from cli_anything.supabase.utils.supabase_backend import SupabaseResult
        result = SupabaseResult(
            args=[FAKE_BINARY, "projects", "list"],
            returncode=returncode,
            stdout=stdout,
            stderr="",
        )
        return result

    @patch("cli_anything.supabase.core.project.run_supabase_json")
    def test_project_list_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run(stdout="[]")
        result = self.runner.invoke(project_group, ["list"])
        assert mock_run.called

    @patch("cli_anything.supabase.core.project.run_supabase_json")
    def test_project_list_json_output(self, mock_run):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run(stdout='[{"id":"abc","name":"test","region":"us-east-1","status":"ACTIVE_HEALTHY"}]')
        result = self.runner.invoke(project_group, ["list", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    @patch("cli_anything.supabase.core.project.run_supabase_json")
    def test_project_list_json_has_required_keys(self, mock_run):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run(stdout="[]")
        result = self.runner.invoke(project_group, ["list", "--json"])
        data = json.loads(result.output)
        for key in ("success", "command", "returncode", "stdout", "stderr", "data"):
            assert key in data

    @patch("cli_anything.supabase.core.project.run_supabase")
    def test_project_init_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(project_group, ["init"])
        assert mock_run.called

    @patch("cli_anything.supabase.core.project.run_supabase")
    def test_project_init_json_output(self, mock_run):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run(stdout="Initialized project")
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(project_group, ["init", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert data["success"] is True

    @patch("cli_anything.supabase.core.project._save_session")
    @patch("cli_anything.supabase.core.project.run_supabase")
    def test_project_link_calls_supabase(self, mock_run, mock_save):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run()
        result = self.runner.invoke(project_group, ["link", "myref"])
        assert mock_run.called
        args_used = mock_run.call_args.args[0]
        assert "link" in args_used
        assert "myref" in args_used

    @patch("cli_anything.supabase.core.project._save_session")
    @patch("cli_anything.supabase.core.project.run_supabase")
    def test_project_link_saves_session(self, mock_run, mock_save):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run()
        result = self.runner.invoke(project_group, ["link", "myref"])
        assert mock_save.called

    @patch("cli_anything.supabase.core.project._save_session")
    @patch("cli_anything.supabase.core.project._load_session", return_value={"project_ref": "old"})
    @patch("cli_anything.supabase.core.project.run_supabase")
    def test_project_unlink_removes_session(self, mock_run, mock_load, mock_save):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run()
        result = self.runner.invoke(project_group, ["unlink"])
        # Check that save was called with a dict missing project_ref
        saved = mock_save.call_args.args[0]
        assert "project_ref" not in saved

    @patch("cli_anything.supabase.core.project.run_supabase")
    def test_project_status_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.project import project_group
        mock_run.return_value = self._mock_run()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(project_group, ["status"])
        assert mock_run.called

    def test_project_session_no_file(self):
        from cli_anything.supabase.core.project import project_group
        with self.runner.isolated_filesystem():
            with patch("cli_anything.supabase.core.project.SESSION_FILE", Path("nonexistent.json")):
                result = self.runner.invoke(project_group, ["session"])
        assert result.exit_code == 0
        assert "No active session" in result.output

    @patch("cli_anything.supabase.core.project._load_session", return_value={"project_ref": "xyz123", "workdir": "/tmp", "linked_at": "2025-01-01"})
    def test_project_session_with_data(self, mock_load):
        from cli_anything.supabase.core.project import project_group
        result = self.runner.invoke(project_group, ["session"])
        assert "xyz123" in result.output

    def test_load_session_missing_file(self):
        from cli_anything.supabase.core.project import _load_session
        with patch("cli_anything.supabase.core.project.SESSION_FILE", Path("/nonexistent/path/session.json")):
            assert _load_session() == {}


# ──────────────────────────────────────────────────────────────────────────────
# 28–37: DB command tests
# ──────────────────────────────────────────────────────────────────────────────

class TestDbCommands:
    def setup_method(self):
        self.runner = CliRunner()

    def _mock(self, stdout="", returncode=0):
        from cli_anything.supabase.utils.supabase_backend import SupabaseResult
        return SupabaseResult(args=[FAKE_BINARY], returncode=returncode, stdout=stdout, stderr="")

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_push_basic_args(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(db_group, ["push"])
        cmd = mock_run.call_args.args[0]
        assert "db" in cmd and "push" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_push_dry_run_flag(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(db_group, ["push", "--dry-run"])
        cmd = mock_run.call_args.args[0]
        assert "--dry-run" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_push_json_output(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock(stdout="Migrated")
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(db_group, ["push", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_pull_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["pull"])
        cmd = mock_run.call_args.args[0]
        assert "db" in cmd and "pull" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_reset_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["reset"])
        cmd = mock_run.call_args.args[0]
        assert "db" in cmd and "reset" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_diff_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["diff"])
        cmd = mock_run.call_args.args[0]
        assert "db" in cmd and "diff" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_diff_linked_flag(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["diff", "--linked"])
        cmd = mock_run.call_args.args[0]
        assert "--linked" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_dump_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["dump"])
        cmd = mock_run.call_args.args[0]
        assert "db" in cmd and "dump" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_lint_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["lint"])
        cmd = mock_run.call_args.args[0]
        assert "db" in cmd and "lint" in cmd

    @patch("cli_anything.supabase.core.db.run_supabase")
    def test_db_push_include_all_flag(self, mock_run):
        from cli_anything.supabase.core.db import db_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(db_group, ["push", "--include-all"])
        cmd = mock_run.call_args.args[0]
        assert "--include-all" in cmd


# ──────────────────────────────────────────────────────────────────────────────
# 38–47: Migration command tests
# ──────────────────────────────────────────────────────────────────────────────

class TestMigrationCommands:
    def setup_method(self):
        self.runner = CliRunner()

    def _mock(self, stdout="", returncode=0):
        from cli_anything.supabase.utils.supabase_backend import SupabaseResult
        return SupabaseResult(args=[FAKE_BINARY], returncode=returncode, stdout=stdout, stderr="")

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_new_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["new", "add_users"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "new" in cmd and "add_users" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_new_json_has_name(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(migration_group, ["new", "add_users", "--json"])
        data = json.loads(result.output)
        assert data["migration_name"] == "add_users"

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_list_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["list"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "list" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_list_local_flag(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["list", "--local"])
        cmd = mock_run.call_args.args[0]
        assert "--local" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_up_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["up"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "up" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_down_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["down", "2"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "down" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_down_json_has_count(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(migration_group, ["down", "3", "--json"])
        data = json.loads(result.output)
        assert data["rolled_back"] == 3

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_repair_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["repair", "20250101120000"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "repair" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_squash_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["squash"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "squash" in cmd

    @patch("cli_anything.supabase.core.migration.run_supabase")
    def test_migration_fetch_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.migration import migration_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(migration_group, ["fetch"])
        cmd = mock_run.call_args.args[0]
        assert "migration" in cmd and "fetch" in cmd


# ──────────────────────────────────────────────────────────────────────────────
# 48–55: Functions command tests
# ──────────────────────────────────────────────────────────────────────────────

class TestFunctionsCommands:
    def setup_method(self):
        self.runner = CliRunner()

    def _mock(self, stdout="", returncode=0):
        from cli_anything.supabase.utils.supabase_backend import SupabaseResult
        return SupabaseResult(args=[FAKE_BINARY], returncode=returncode, stdout=stdout, stderr="")

    @patch("cli_anything.supabase.core.functions.run_supabase")
    def test_functions_deploy_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(functions_group, ["deploy", "my-fn"])
        cmd = mock_run.call_args.args[0]
        assert "functions" in cmd and "deploy" in cmd

    @patch("cli_anything.supabase.core.functions.run_supabase")
    def test_functions_deploy_no_verify_jwt(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(functions_group, ["deploy", "my-fn", "--no-verify-jwt"])
        cmd = mock_run.call_args.args[0]
        assert "--no-verify-jwt" in cmd

    @patch("cli_anything.supabase.core.functions.run_supabase_json")
    def test_functions_list_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock(stdout="[]")
        self.runner.invoke(functions_group, ["list"])
        assert mock_run.called

    @patch("cli_anything.supabase.core.functions.run_supabase")
    def test_functions_delete_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock()
        self.runner.invoke(functions_group, ["delete", "my-fn"])
        cmd = mock_run.call_args.args[0]
        assert "functions" in cmd and "delete" in cmd and "my-fn" in cmd

    @patch("cli_anything.supabase.core.functions.run_supabase")
    def test_functions_new_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(functions_group, ["new", "hello"])
        cmd = mock_run.call_args.args[0]
        assert "functions" in cmd and "new" in cmd and "hello" in cmd

    @patch("cli_anything.supabase.core.functions.run_supabase")
    def test_functions_download_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(functions_group, ["download", "hello"])
        cmd = mock_run.call_args.args[0]
        assert "functions" in cmd and "download" in cmd

    def test_functions_serve_json_mode_no_exec(self):
        from cli_anything.supabase.core.functions import functions_group
        # --json mode should NOT actually launch a server
        result = self.runner.invoke(functions_group, ["serve", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "note" in data
        assert "Interactive serve" in data["note"]

    @patch("cli_anything.supabase.core.functions.run_supabase")
    def test_functions_deploy_json_has_name(self, mock_run):
        from cli_anything.supabase.core.functions import functions_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            result = self.runner.invoke(functions_group, ["deploy", "my-fn", "--json"])
        data = json.loads(result.output)
        assert data["function_name"] == "my-fn"


# ──────────────────────────────────────────────────────────────────────────────
# 56–60: Inspect command tests
# ──────────────────────────────────────────────────────────────────────────────

class TestInspectCommands:
    def setup_method(self):
        self.runner = CliRunner()

    def _mock(self, stdout="", returncode=0):
        from cli_anything.supabase.utils.supabase_backend import SupabaseResult
        return SupabaseResult(args=[FAKE_BINARY], returncode=returncode, stdout=stdout, stderr="")

    @patch("cli_anything.supabase.core.inspect.run_supabase")
    def test_inspect_tables_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.inspect import inspect_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(inspect_group, ["tables"])
        cmd = mock_run.call_args.args[0]
        assert "inspect" in cmd and "db" in cmd and "table-stats" in cmd

    @patch("cli_anything.supabase.core.inspect.run_supabase")
    def test_inspect_indexes_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.inspect import inspect_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(inspect_group, ["indexes"])
        cmd = mock_run.call_args.args[0]
        assert "index-stats" in cmd

    @patch("cli_anything.supabase.core.inspect.run_supabase")
    def test_inspect_locks_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.inspect import inspect_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(inspect_group, ["locks"])
        cmd = mock_run.call_args.args[0]
        assert "locks" in cmd

    @patch("cli_anything.supabase.core.inspect.run_supabase")
    def test_inspect_bloat_calls_supabase(self, mock_run):
        from cli_anything.supabase.core.inspect import inspect_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(inspect_group, ["bloat"])
        cmd = mock_run.call_args.args[0]
        assert "bloat" in cmd

    @patch("cli_anything.supabase.core.inspect.run_supabase")
    def test_inspect_local_flag(self, mock_run):
        from cli_anything.supabase.core.inspect import inspect_group
        mock_run.return_value = self._mock()
        with self.runner.isolated_filesystem():
            self.runner.invoke(inspect_group, ["tables", "--local"])
        cmd = mock_run.call_args.args[0]
        assert "--local" in cmd
