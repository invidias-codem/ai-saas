from click.testing import CliRunner
from unittest.mock import patch
from cli_anything.gcloud.modules.functions import functions

@patch('cli_anything.gcloud.modules.functions.run_gcloud')
def test_functions_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"name": "func1"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(functions, ['list', '--region', 'us-east1'])
    assert result.exit_code == 0
    assert '[{"name": "func1"}]' in result.output
    
    args = mock_run.call_args[0][0]
    assert args == ['functions', 'list', '--region', 'us-east1']

@patch('cli_anything.gcloud.modules.functions.run_gcloud')
def test_functions_describe(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"name": "func1"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(functions, ['describe', 'func1', '--project', 'myproj'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    kwargs = mock_run.call_args[1]
    assert args == ['functions', 'describe', 'func1']
    assert kwargs['project'] == 'myproj'

@patch('cli_anything.gcloud.modules.functions.run_gcloud')
def test_functions_logs_read(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"log": "funclog"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(functions, ['logs-read', 'func1', '--limit', '15'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['functions', 'logs', 'read', 'func1', '--limit', '15']

@patch('cli_anything.gcloud.modules.functions.run_gcloud')
def test_functions_deploy(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"status": "ok"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(functions, ['deploy', 'func1', '--trigger-http', '--runtime', 'python39'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['functions', 'deploy', 'func1', '--trigger-http', '--runtime', 'python39']

@patch('cli_anything.gcloud.modules.functions.run_gcloud')
def test_functions_fail(mock_run):
    mock_run.return_value = {"success": False, "stdout": '', "stderr": "func error"}
    runner = CliRunner()
    result = runner.invoke(functions, ['list'])
    assert result.exit_code == 0
    assert 'func error' in result.output
