from click.testing import CliRunner
from unittest.mock import patch
from cli_anything.gcloud.modules.run import run_grp

@patch('cli_anything.gcloud.modules.run.run_gcloud')
def test_run_services_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"name": "srv"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(run_grp, ['services', 'list', '--region', 'us-central1'])
    assert result.exit_code == 0
    assert '[{"name": "srv"}]' in result.output
    
    args = mock_run.call_args[0][0]
    assert args == ['run', 'services', 'list', '--region', 'us-central1']

@patch('cli_anything.gcloud.modules.run.run_gcloud')
def test_run_services_describe(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"name": "srv"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(run_grp, ['services', 'describe', 'srv1', '--project', 'test'])
    assert result.exit_code == 0
    assert '{"name": "srv"}' in result.output
    
    args = mock_run.call_args[0][0]
    kwargs = mock_run.call_args[1]
    assert args == ['run', 'services', 'describe', 'srv1']
    assert kwargs['project'] == 'test'

@patch('cli_anything.gcloud.modules.run.run_gcloud')
def test_run_revisions_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"name": "rev"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(run_grp, ['revisions', 'list', '--service', 'srv1'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['run', 'revisions', 'list', '--service', 'srv1']

@patch('cli_anything.gcloud.modules.run.run_gcloud')
def test_run_logs_read(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"log": "run"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(run_grp, ['logs-read', 'srv1', '--limit', '20'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['run', 'services', 'logs', 'read', 'srv1', '--limit', '20']

@patch('cli_anything.gcloud.modules.run.run_gcloud')
def test_run_services_fail(mock_run):
    mock_run.return_value = {"success": False, "stdout": '', "stderr": "run error"}
    runner = CliRunner()
    result = runner.invoke(run_grp, ['services', 'list'])
    assert result.exit_code == 0
    assert 'run error' in result.output
