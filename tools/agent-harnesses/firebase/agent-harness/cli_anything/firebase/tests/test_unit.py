"""
test_unit.py — Unit tests for the Firebase CLI harness.

All tests run standalone without a real Firebase project or internet access.
Mocks subprocess.run to avoid any external calls.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
ROOT = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(ROOT))

from cli_anything.firebase.firebase_cli import cli
from cli_anything.firebase.utils.firebase_backend import (
    FirebaseResult,
    find_firebase,
    read_firebaserc,
    resolve_project,
    run_firebase,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_BINARY = "/usr/local/bin/firebase"


def make_result(args=None, returncode=0, stdout="", stderr=""):
    return FirebaseResult(
        args=args or [FAKE_BINARY],
        returncode=returncode,
        stdout=stdout,
        stderr=stderr,
    )


def mock_subprocess(stdout="", stderr="", returncode=0):
    """Return a mock subprocess.CompletedProcess."""
    m = MagicMock()
    m.returncode = returncode
    m.stdout = stdout
    m.stderr = stderr
    return m


# ===========================================================================
# FirebaseResult
# ===========================================================================


class TestFirebaseResult:
    def test_success_true_on_zero(self):
        r = make_result(returncode=0)
        assert r.success is True

    def test_success_false_on_nonzero(self):
        r = make_result(returncode=1)
        assert r.success is False

    def test_command_strips_binary(self):
        r = make_result(args=[FAKE_BINARY, "deploy", "--only", "hosting"])
        assert r.command == "deploy --only hosting"

    def test_command_empty_for_binary_only(self):
        r = make_result(args=[FAKE_BINARY])
        assert r.command == ""

    def test_parsed_valid_json(self):
        r = make_result(stdout='{"status": "ok"}')
        assert r.parsed() == {"status": "ok"}

    def test_parsed_invalid_json_returns_none(self):
        r = make_result(stdout="not-json")
        assert r.parsed() is None

    def test_parsed_empty_string_returns_none(self):
        r = make_result(stdout="")
        assert r.parsed() is None

    def test_parsed_cached(self):
        r = make_result(stdout='{"a": 1}')
        first = r.parsed()
        second = r.parsed()
        assert first is second  # same object, cached

    def test_to_dict_structure(self):
        r = make_result(returncode=0, stdout='{"ok": true}', stderr="warn")
        d = r.to_dict()
        assert d["success"] is True
        assert d["returncode"] == 0
        assert d["data"] == {"ok": True}
        assert d["stderr"] == "warn"

    def test_to_dict_no_json_data(self):
        r = make_result(stdout="plain text")
        d = r.to_dict()
        assert d["data"] is None


# ===========================================================================
# find_firebase
# ===========================================================================


class TestFindFirebase:
    def test_finds_via_which(self):
        with patch("shutil.which", return_value="/usr/bin/firebase"):
            assert find_firebase() == "/usr/bin/firebase"

    def test_falls_back_to_known_path(self):
        with patch("shutil.which", return_value=None), \
             patch("os.path.isfile", return_value=True), \
             patch("os.access", return_value=True):
            path = find_firebase()
            assert "firebase" in path

    def test_raises_when_not_found(self):
        with patch("shutil.which", return_value=None), \
             patch("os.path.isfile", return_value=False):
            with pytest.raises(RuntimeError, match="Firebase CLI not found"):
                find_firebase()


# ===========================================================================
# read_firebaserc
# ===========================================================================


class TestReadFirebaserc:
    def test_returns_default_project(self, tmp_path):
        rc = tmp_path / ".firebaserc"
        rc.write_text(json.dumps({"projects": {"default": "my-project"}}))
        assert read_firebaserc(str(tmp_path)) == "my-project"

    def test_returns_first_project_if_no_default(self, tmp_path):
        rc = tmp_path / ".firebaserc"
        rc.write_text(json.dumps({"projects": {"staging": "staging-id"}}))
        assert read_firebaserc(str(tmp_path)) == "staging-id"

    def test_returns_none_when_no_file(self, tmp_path):
        assert read_firebaserc(str(tmp_path)) is None

    def test_returns_none_on_invalid_json(self, tmp_path):
        rc = tmp_path / ".firebaserc"
        rc.write_text("not-json")
        assert read_firebaserc(str(tmp_path)) is None

    def test_returns_none_empty_projects(self, tmp_path):
        rc = tmp_path / ".firebaserc"
        rc.write_text(json.dumps({"projects": {}}))
        assert read_firebaserc(str(tmp_path)) is None


# ===========================================================================
# resolve_project
# ===========================================================================


class TestResolveProject:
    def test_explicit_wins(self):
        with patch.dict(os.environ, {"FIREBASE_PROJECT": "env-project"}):
            assert resolve_project(project="explicit") == "explicit"

    def test_env_var_used_when_no_explicit(self):
        with patch.dict(os.environ, {"FIREBASE_PROJECT": "env-project"}):
            assert resolve_project() == "env-project"

    def test_firebaserc_fallback(self, tmp_path):
        rc = tmp_path / ".firebaserc"
        rc.write_text(json.dumps({"projects": {"default": "rc-project"}}))
        with patch.dict(os.environ, {}, clear=True):
            # Remove FIREBASE_PROJECT if set
            env = os.environ.copy()
            env.pop("FIREBASE_PROJECT", None)
            with patch.dict(os.environ, env, clear=True):
                assert resolve_project(cwd=str(tmp_path)) == "rc-project"

    def test_none_when_nothing_set(self, tmp_path):
        env = {k: v for k, v in os.environ.items() if k != "FIREBASE_PROJECT"}
        with patch.dict(os.environ, env, clear=True):
            result = resolve_project(cwd=str(tmp_path))
            assert result is None


# ===========================================================================
# run_firebase
# ===========================================================================


class TestRunFirebase:
    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_basic_invocation(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"status":"ok"}')
        result = run_firebase(["projects:list"])
        assert mock_run.called
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == FAKE_BINARY
        assert "projects:list" in cmd
        assert "--json" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_project_flag_injected(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        run_firebase(["deploy"], project="my-proj")
        cmd = mock_run.call_args[0][0]
        assert "-P" in cmd
        assert "my-proj" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_no_json_flag_when_disabled(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        run_firebase(["--version"], json_output=False)
        cmd = mock_run.call_args[0][0]
        assert "--json" not in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_no_shell_true(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        run_firebase(["projects:list"])
        kwargs = mock_run.call_args[1]
        assert not kwargs.get("shell", False)

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_returns_firebase_result(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout="output", stderr="err", returncode=0)
        result = run_firebase(["projects:list"])
        assert isinstance(result, FirebaseResult)
        assert result.success

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_failure_reflected(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(returncode=1, stderr="Error!")
        result = run_firebase(["deploy"])
        assert not result.success
        assert result.returncode == 1

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_cwd_passed(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        run_firebase(["deploy"], cwd="/tmp/myproject")
        kwargs = mock_run.call_args[1]
        assert kwargs.get("cwd") == "/tmp/myproject"

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_env_merged(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        run_firebase(["deploy"], env={"MY_KEY": "MY_VAL"})
        kwargs = mock_run.call_args[1]
        assert kwargs["env"]["MY_KEY"] == "MY_VAL"


# ===========================================================================
# CLI: top-level
# ===========================================================================


class TestCliTopLevel:
    def test_help_exits_zero(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["--help"])
        assert result.exit_code == 0
        assert "Firebase" in result.output

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_version_command(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout="15.9.1")
        runner = CliRunner()
        result = runner.invoke(cli, ["version"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_status_command_json(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout="15.9.1")
        runner = CliRunner()
        result = runner.invoke(cli, ["--json", "status"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "firebase_cli" in data
        assert "active_project" in data

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_raw_command(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"projects":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["raw", "projects:list"])
        assert result.exit_code == 0


# ===========================================================================
# CLI: deploy group
# ===========================================================================


class TestDeployGroup:
    def test_deploy_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["deploy", "--help"])
        assert result.exit_code == 0
        assert "deploy" in result.output.lower()

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_deploy_all(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"status":"success"}')
        runner = CliRunner()
        result = runner.invoke(cli, ["deploy", "all"])
        assert result.exit_code == 0
        cmd = mock_run.call_args[0][0]
        assert "deploy" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_deploy_hosting_only(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["deploy", "hosting"])
        cmd = mock_run.call_args[0][0]
        assert "--only" in cmd
        assert "hosting" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_deploy_functions_only(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["deploy", "functions"])
        cmd = mock_run.call_args[0][0]
        assert "functions" in " ".join(cmd)

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_deploy_with_message(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["deploy", "all", "--message", "v1.2.3"])
        cmd = mock_run.call_args[0][0]
        assert "--message" in cmd
        assert "v1.2.3" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_deploy_preview_channel(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["deploy", "preview-channel", "staging"])
        cmd = mock_run.call_args[0][0]
        assert "hosting:channel:deploy" in cmd
        assert "staging" in cmd


# ===========================================================================
# CLI: hosting group
# ===========================================================================


class TestHostingGroup:
    def test_hosting_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["hosting", "--help"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_channel_list(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"channels":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["hosting", "channel-list"])
        cmd = mock_run.call_args[0][0]
        assert "hosting:channel:list" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_channel_create(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["hosting", "channel-create", "preview-1"])
        cmd = mock_run.call_args[0][0]
        assert "hosting:channel:create" in cmd
        assert "preview-1" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_channel_delete_with_force(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["hosting", "channel-delete", "old-chan", "--force"])
        cmd = mock_run.call_args[0][0]
        assert "--force" in cmd


# ===========================================================================
# CLI: functions group
# ===========================================================================


class TestFunctionsGroup:
    def test_functions_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["functions", "--help"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_functions_list(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"functions":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["functions", "list"])
        cmd = mock_run.call_args[0][0]
        assert "functions:list" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_functions_log(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["functions", "log", "--lines", "50"])
        cmd = mock_run.call_args[0][0]
        assert "functions:log" in cmd
        assert "50" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_functions_config_get(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{}')
        runner = CliRunner()
        result = runner.invoke(cli, ["functions", "config-get"])
        cmd = mock_run.call_args[0][0]
        assert "functions:config:get" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_functions_config_set(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["functions", "config-set", "stripe.key=sk_live_123"])
        cmd = mock_run.call_args[0][0]
        assert "functions:config:set" in cmd
        assert "stripe.key=sk_live_123" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_functions_delete(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["functions", "delete", "myFunc", "--force"])
        cmd = mock_run.call_args[0][0]
        assert "functions:delete" in cmd
        assert "myFunc" in cmd
        assert "--force" in cmd


# ===========================================================================
# CLI: firestore group
# ===========================================================================


class TestFirestoreGroup:
    def test_firestore_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["firestore", "--help"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_firestore_indexes(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"indexes":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["firestore", "indexes"])
        cmd = mock_run.call_args[0][0]
        assert "firestore:indexes" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_firestore_locations(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["firestore", "locations"])
        cmd = mock_run.call_args[0][0]
        assert "firestore:locations" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_firestore_delete_requires_path_or_flag(self, mock_find, mock_run):
        runner = CliRunner()
        result = runner.invoke(cli, ["firestore", "delete"])
        assert result.exit_code != 0


# ===========================================================================
# CLI: projects group
# ===========================================================================


class TestProjectsGroup:
    def test_projects_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["projects", "--help"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_projects_list(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"projects":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["projects", "list"])
        cmd = mock_run.call_args[0][0]
        assert "projects:list" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_projects_use(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["projects", "use", "my-project-id"])
        cmd = mock_run.call_args[0][0]
        assert "use" in cmd
        assert "my-project-id" in cmd


# ===========================================================================
# CLI: apps group
# ===========================================================================


class TestAppsGroup:
    def test_apps_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["apps", "--help"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_apps_list(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"apps":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["apps", "list"])
        cmd = mock_run.call_args[0][0]
        assert "apps:list" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_apps_list_with_platform(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["apps", "list", "--platform", "WEB"])
        cmd = mock_run.call_args[0][0]
        assert "WEB" in cmd

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_apps_sdkconfig(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"sdkConfig":{}}')
        runner = CliRunner()
        result = runner.invoke(cli, ["apps", "sdkconfig", "--platform", "WEB"])
        cmd = mock_run.call_args[0][0]
        assert "apps:sdkconfig" in cmd


# ===========================================================================
# CLI: emulators group
# ===========================================================================


class TestEmulatorsGroup:
    def test_emulators_help(self):
        runner = CliRunner()
        result = runner.invoke(cli, ["emulators", "--help"])
        assert result.exit_code == 0

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_emulators_export(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess()
        runner = CliRunner()
        result = runner.invoke(cli, ["emulators", "export", "/tmp/emulator-data"])
        cmd = mock_run.call_args[0][0]
        assert "emulators:export" in cmd
        assert "/tmp/emulator-data" in cmd


# ===========================================================================
# JSON output mode
# ===========================================================================


class TestJsonOutputMode:
    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_json_flag_wraps_output(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(stdout='{"projects":[]}')
        runner = CliRunner()
        result = runner.invoke(cli, ["--json", "projects", "list"])
        data = json.loads(result.output)
        assert "success" in data
        assert "command" in data

    @patch("subprocess.run")
    @patch("cli_anything.firebase.utils.firebase_backend.find_firebase", return_value=FAKE_BINARY)
    def test_json_on_failure(self, mock_find, mock_run):
        mock_run.return_value = mock_subprocess(returncode=1, stderr="Error!")
        runner = CliRunner()
        result = runner.invoke(cli, ["--json", "deploy", "all"])
        data = json.loads(result.output)
        assert data["success"] is False
        assert data["returncode"] == 1
