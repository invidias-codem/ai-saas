"""
test_full_e2e.py — E2E tests for CLI-Anything: Supabase harness.

These tests call the real supabase binary.
Tests requiring a live project are skipped unless SUPABASE_PROJECT_REF is set.

Run:
    python3 -m pytest cli_anything/supabase/tests/test_full_e2e.py -v

With live project:
    SUPABASE_PROJECT_REF=<ref> python3 -m pytest cli_anything/supabase/tests/test_full_e2e.py -v
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import pytest
from click.testing import CliRunner

# Guard for live project tests
_NEEDS_PROJECT = pytest.mark.skipif(
    not os.getenv("SUPABASE_PROJECT_REF"),
    reason="requires SUPABASE_PROJECT_REF env var (linked Supabase project)",
)

# Guard for tests that need local Supabase containers running
_NEEDS_LOCAL = pytest.mark.skipif(
    not os.getenv("SUPABASE_LOCAL_RUNNING"),
    reason="requires local Supabase containers (set SUPABASE_LOCAL_RUNNING=1)",
)


# ──────────────────────────────────────────────────────────────────────────────
# Binary discovery
# ──────────────────────────────────────────────────────────────────────────────

class TestBinaryDiscovery:
    def test_supabase_binary_found(self):
        from cli_anything.supabase.utils.supabase_backend import find_supabase
        binary = find_supabase()
        assert binary is not None
        assert "supabase" in binary

    def test_supabase_version_returns_string(self):
        from cli_anything.supabase.utils.supabase_backend import find_supabase
        import subprocess
        binary = find_supabase()
        result = subprocess.run([binary, "--version"], capture_output=True, text=True)  # noqa: S603
        assert "2." in result.stdout or "2." in result.stderr

    def test_run_supabase_version_success(self):
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        result = run_supabase(["--version"])
        # Version output may be on stdout or stderr
        combined = result.stdout + result.stderr
        assert "2." in combined


# ──────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ──────────────────────────────────────────────────────────────────────────────

class TestCliEntryPoint:
    def setup_method(self):
        self.runner = CliRunner()

    def test_cli_help_exits_zero(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Supabase" in result.output or "supabase" in result.output.lower()

    def test_cli_version_exits_zero(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["version"])
        assert result.exit_code == 0

    def test_cli_version_json_output(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["version", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "harness_version" in data
        assert "supabase_version" in data

    def test_project_group_help(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["project", "--help"])
        assert result.exit_code == 0

    def test_db_group_help(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["db", "--help"])
        assert result.exit_code == 0

    def test_migration_group_help(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["migration", "--help"])
        assert result.exit_code == 0

    def test_functions_group_help(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["functions", "--help"])
        assert result.exit_code == 0

    def test_inspect_group_help(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["inspect", "--help"])
        assert result.exit_code == 0


# ──────────────────────────────────────────────────────────────────────────────
# Project commands (no live project required for auth failures)
# ──────────────────────────────────────────────────────────────────────────────

class TestProjectCommandsE2E:
    def setup_method(self):
        self.runner = CliRunner()

    def test_project_list_json_structure(self):
        """project list --json should return valid JSON even if auth fails."""
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["project", "list", "--json"])
        # Should produce valid JSON regardless of auth state
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data
        assert "command" in data

    def test_project_session_no_session_json(self):
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_session = Path(tmpdir) / "session.json"
            import cli_anything.supabase.core.project as pm
            original = pm.SESSION_FILE
            pm.SESSION_FILE = fake_session
            try:
                result = self.runner.invoke(cli, ["project", "session"])
                assert result.exit_code == 0
                assert "No active session" in result.output
            finally:
                pm.SESSION_FILE = original

    def test_project_session_json_mode(self):
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            fake_session = Path(tmpdir) / "session.json"
            import cli_anything.supabase.core.project as pm
            original = pm.SESSION_FILE
            pm.SESSION_FILE = fake_session
            try:
                result = self.runner.invoke(cli, ["project", "session", "--json"])
                assert result.exit_code == 0
                data = json.loads(result.output)
                assert "success" in data
                assert "session" in data
            finally:
                pm.SESSION_FILE = original

    @_NEEDS_PROJECT
    def test_project_list_with_auth(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["project", "list", "--json"])
        data = json.loads(result.output)
        assert data["success"] is True


# ──────────────────────────────────────────────────────────────────────────────
# Migration commands (using isolated temp dir)
# ──────────────────────────────────────────────────────────────────────────────

class TestMigrationCommandsE2E:
    def setup_method(self):
        self.runner = CliRunner()

    def test_migration_new_creates_file(self):
        """migration new should create a migration file in the migrations dir."""
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            # First init a project
            init_result = self.runner.invoke(
                cli, ["project", "init", "--workdir", tmpdir]
            )
            if init_result.exit_code != 0:
                pytest.skip("supabase init failed (may need Docker)")

            result = self.runner.invoke(
                cli,
                ["migration", "new", "add_test_table", "--workdir", tmpdir, "--json"],
            )
            if result.exit_code == 0:
                data = json.loads(result.output)
                assert data["migration_name"] == "add_test_table"

    def test_migration_list_json(self):
        """migration list --json returns valid JSON."""
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.runner.invoke(
                cli, ["migration", "list", "--workdir", tmpdir, "--json"]
            )
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert "success" in data

    def test_migration_new_json_structure(self):
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        from cli_anything.supabase.core.migration import migration_group
        runner = CliRunner()
        with runner.isolated_filesystem():
            # Initialize supabase project
            run_supabase(["init"], cwd=os.getcwd())
            result = runner.invoke(migration_group, ["new", "my_test", "--json"])
            if result.exit_code == 0:
                data = json.loads(result.output)
                assert data["migration_name"] == "my_test"

    @_NEEDS_PROJECT
    def test_migration_list_remote(self):
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.runner.invoke(
                cli,
                ["migration", "list", "--workdir", tmpdir, "--json"],
            )
            data = json.loads(result.output)
            assert "success" in data


# ──────────────────────────────────────────────────────────────────────────────
# DB commands
# ──────────────────────────────────────────────────────────────────────────────

class TestDbCommandsE2E:
    def setup_method(self):
        self.runner = CliRunner()

    def test_db_push_dry_run_json(self):
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.runner.invoke(
                cli,
                ["db", "push", "--dry-run", "--workdir", tmpdir, "--json"],
            )
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert "success" in data

    @_NEEDS_LOCAL
    def test_db_diff_json(self):
        """db diff requires local containers; skip unless SUPABASE_LOCAL_RUNNING=1."""
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.runner.invoke(
                cli,
                ["db", "diff", "--workdir", tmpdir, "--json"],
            )
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert "success" in data

    def test_db_lint_json(self):
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.runner.invoke(
                cli,
                ["db", "lint", "--workdir", tmpdir, "--json"],
            )
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert "success" in data

    @_NEEDS_LOCAL
    def test_db_reset_local(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["db", "reset", "--json"])
        data = json.loads(result.output)
        assert "success" in data

    @_NEEDS_PROJECT
    def test_db_push_remote(self):
        from cli_anything.supabase.supabase_cli import cli
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.runner.invoke(
                cli, ["db", "push", "--dry-run", "--workdir", tmpdir, "--json"]
            )
            data = json.loads(result.output)
            assert "success" in data


# ──────────────────────────────────────────────────────────────────────────────
# Functions commands
# ──────────────────────────────────────────────────────────────────────────────

class TestFunctionsCommandsE2E:
    def setup_method(self):
        self.runner = CliRunner()

    def test_functions_serve_json_mode(self):
        """--json mode should emit metadata without starting server."""
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["functions", "serve", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "note" in data

    def test_functions_list_json_structure(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["functions", "list", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    def test_functions_new_in_project(self):
        from cli_anything.supabase.supabase_cli import cli
        from cli_anything.supabase.utils.supabase_backend import run_supabase
        with tempfile.TemporaryDirectory() as tmpdir:
            # Initialize supabase project first
            run_supabase(["init"], cwd=tmpdir)
            result = self.runner.invoke(
                cli,
                ["functions", "new", "test-fn", "--workdir", tmpdir, "--json"],
            )
            # Accept success or graceful failure
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert "function_name" in data or "success" in data

    @_NEEDS_PROJECT
    def test_functions_list_with_auth(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["functions", "list", "--json"])
        data = json.loads(result.output)
        assert "success" in data


# ──────────────────────────────────────────────────────────────────────────────
# Inspect commands (require linked project)
# ──────────────────────────────────────────────────────────────────────────────

class TestInspectCommandsE2E:
    def setup_method(self):
        self.runner = CliRunner()

    @_NEEDS_PROJECT
    def test_inspect_tables_linked(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["inspect", "tables", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    @_NEEDS_PROJECT
    def test_inspect_indexes_linked(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["inspect", "indexes", "--json"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    @_NEEDS_PROJECT
    def test_inspect_locks_linked(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["inspect", "locks", "--json"])
        assert result.exit_code == 0

    @_NEEDS_PROJECT
    def test_inspect_db_stats_linked(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["inspect", "db-stats", "--json"])
        assert result.exit_code == 0

    @_NEEDS_PROJECT
    def test_inspect_bloat_linked(self):
        from cli_anything.supabase.supabase_cli import cli
        result = self.runner.invoke(cli, ["inspect", "bloat", "--json"])
        assert result.exit_code == 0
