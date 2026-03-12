from click.testing import CliRunner
from unittest.mock import patch
from cli_anything.gcloud.gcloud_cli import cli

def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(cli, ['--help'])
    assert result.exit_code == 0
    assert 'CLI-Anything harness for Google Cloud (gcloud)' in result.output
    assert 'logging' in result.output
    assert 'compute' in result.output
    assert 'projects' in result.output
    assert 'functions' in result.output
    assert 'run' in result.output

@patch('builtins.input', side_effect=['logging read', 'exit'])
@patch('cli_anything.gcloud.gcloud_cli.get_default_project')
@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_repl(mock_run, mock_get_project, mock_input):
    mock_get_project.return_value = 'my-test-proj'
    mock_run.return_value = {"success": True, "stdout": "mocked", "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(cli, ['repl'])
    assert result.exit_code == 0
    assert "Starting gcloud REPL" in result.output
