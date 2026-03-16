"""
test_e2e.py — End-to-end tests for the Firebase CLI harness.

Tests that actually invoke the Firebase binary.
Live-project tests are skipped unless FIREBASE_PROJECT is set.
Binary-availability tests run as long as firebase is installed.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from click.testing import CliRunner

ROOT = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(ROOT))

from cli_anything.firebase.firebase_cli import cli
from cli_anything.firebase.utils.firebase_backend import (
    find_firebase,
    read_firebaserc,
    run_firebase,
)

# ---------------------------------------------------------------------------
# Markers
# ---------------------------------------------------------------------------

FIREBASE_PROJECT = os.getenv("FIREBASE_PROJECT")

requires_project = pytest.mark.skipif(
    not FIREBASE_PROJECT,
    reason="requires FIREBASE_PROJECT environment variable",
)

# ---------------------------------------------------------------------------
# Binary-level E2E (no project required)
# ---------------------------------------------------------------------------


class TestBinaryAvailable:
    def test_find_firebase_returns_path(self):
        path = find_firebase()
        assert path
        assert "firebase" in path

    def test_firebase_version_runs(self):
        result = run_firebase(["--version"], json_output=False)
        assert result.success
        assert result.stdout  # e.g. "15.9.1"

    def test_firebase_help_runs(self):
        result = run_firebase(["--help"], json_output=False)
        # firebase --help exits 0
        assert result.returncode == 0 or result.stdout

    def test_firebase_invalid_command_fails(self):
        result = run_firebase(["nonexistent-command-xyz"], json_output=False)
        assert not result.success


class TestCliVersion:
    def test_cli_version_command(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["version"])
        assert result.exit_code == 0

    def test_cli_version_json(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--json", "version"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "version" in data
        assert data["success"] is True


class TestCliStatus:
    def test_status_text(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "Firebase CLI" in result.output

    def test_status_json(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--json", "status"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "firebase_cli" in data
        assert "binary" in data
        assert "active_project" in data


class TestFirebaseRcReading:
    def test_reads_firebaserc(self, tmp_path):
        rc = tmp_path / ".firebaserc"
        rc.write_text(json.dumps({"projects": {"default": "e2e-test-project"}}))
        result = read_firebaserc(str(tmp_path))
        assert result == "e2e-test-project"

    def test_missing_firebaserc(self, tmp_path):
        result = read_firebaserc(str(tmp_path))
        assert result is None


# ---------------------------------------------------------------------------
# Project-level E2E (requires FIREBASE_PROJECT)
# ---------------------------------------------------------------------------


@requires_project
class TestProjectsLive:
    def test_projects_list(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["-P", FIREBASE_PROJECT, "projects", "list"])
        assert result.exit_code == 0

    def test_projects_list_json(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--json", "-P", FIREBASE_PROJECT, "projects", "list"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    def test_projects_info(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["-P", FIREBASE_PROJECT, "projects", "info"])
        assert result.exit_code == 0


@requires_project
class TestAppsLive:
    def test_apps_list(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["-P", FIREBASE_PROJECT, "apps", "list"])
        assert result.exit_code == 0

    def test_apps_list_web(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["-P", FIREBASE_PROJECT, "apps", "list", "--platform", "WEB"]
        )
        assert result.exit_code == 0

    def test_apps_list_json(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["--json", "-P", FIREBASE_PROJECT, "apps", "list"]
        )
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data


@requires_project
class TestFirestoreLive:
    def test_firestore_indexes(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["-P", FIREBASE_PROJECT, "firestore", "indexes"])
        assert result.exit_code == 0

    def test_firestore_indexes_json(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["--json", "-P", FIREBASE_PROJECT, "firestore", "indexes"]
        )
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "success" in data

    def test_firestore_locations(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["-P", FIREBASE_PROJECT, "firestore", "locations"])
        assert result.exit_code == 0


@requires_project
class TestFunctionsLive:
    def test_functions_list(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["-P", FIREBASE_PROJECT, "functions", "list"])
        # May fail if no functions deployed — that's ok, just check binary ran
        assert result.exit_code in (0, 1)

    def test_functions_config_get(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["-P", FIREBASE_PROJECT, "functions", "config-get"]
        )
        assert result.exit_code in (0, 1)


@requires_project
class TestHostingLive:
    def test_hosting_channel_list(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["-P", FIREBASE_PROJECT, "hosting", "channel-list"]
        )
        assert result.exit_code in (0, 1)

    def test_hosting_channel_list_json(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["--json", "-P", FIREBASE_PROJECT, "hosting", "channel-list"]
        )
        assert result.exit_code in (0, 1)
        if result.exit_code == 0:
            data = json.loads(result.output)
            assert "success" in data


@requires_project
class TestRawCommandLive:
    def test_raw_projects_list(self):
        runner = CliRunner()
        result = runner.invoke(
            cli, ["-P", FIREBASE_PROJECT, "raw", "projects:list"]
        )
        assert result.exit_code == 0

    def test_raw_no_json(self):
        runner = CliRunner()
        result = runner.invoke(
            cli,
            ["-P", FIREBASE_PROJECT, "raw", "--no-json", "projects:list"],
        )
        assert result.exit_code == 0
