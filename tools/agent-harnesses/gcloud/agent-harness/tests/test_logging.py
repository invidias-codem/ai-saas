from click.testing import CliRunner
from unittest.mock import patch
from cli_anything.gcloud.modules.logging import logging

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_read(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"log": "msg"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(logging, ['read', '--limit', '5', '--project', 'test-proj'])
    assert result.exit_code == 0
    assert '{"log": "msg"}' in result.output
    
    args = mock_run.call_args[0][0]
    kwargs = mock_run.call_args[1]
    assert args == ['logging', 'read', '--limit', '5']
    assert kwargs['project'] == 'test-proj'
    assert kwargs['use_json'] is True

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_read_filter(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"log": "msg"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(logging, ['read', '--filter', 'severity>=ERROR'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert 'severity>=ERROR' in args

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_read_freshness(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"log": "msg"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(logging, ['read', '--freshness', '1h'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert '--freshness' in args
    assert '1h' in args

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_tail(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"log": "tail"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(logging, ['tail', '--filter', 'resource.type=gce_instance'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    # tail maps to read with limit 10 and freshness 1h
    assert args == ['logging', 'read', 'resource.type=gce_instance', '--limit', '10', '--freshness', '1h']

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_metrics_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(logging, ['metrics-list'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['logging', 'metrics', 'list']

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_sinks_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(logging, ['sinks-list'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['logging', 'sinks', 'list']

@patch('cli_anything.gcloud.modules.logging.run_gcloud')
def test_logging_read_fail(mock_run):
    mock_run.return_value = {"success": False, "stdout": '', "stderr": "read error"}
    runner = CliRunner()
    result = runner.invoke(logging, ['read'])
    assert result.exit_code == 0
    assert 'read error' in result.output
