from click.testing import CliRunner
from unittest.mock import patch
from cli_anything.gcloud.modules.compute import compute

@patch('cli_anything.gcloud.modules.compute.run_gcloud')
def test_compute_instances_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"name": "inst1"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(compute, ['instances', 'list', '--zone', 'us-east1-b'])
    assert result.exit_code == 0
    assert '[{"name": "inst1"}]' in result.output
    
    args = mock_run.call_args[0][0]
    assert args == ['compute', 'instances', 'list', '--zone', 'us-east1-b']

@patch('cli_anything.gcloud.modules.compute.run_gcloud')
def test_compute_instances_describe(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"name": "inst1"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(compute, ['instances', 'describe', 'inst1', '--project', 'testproj'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    kwargs = mock_run.call_args[1]
    assert args == ['compute', 'instances', 'describe', 'inst1']
    assert kwargs['project'] == 'testproj'

@patch('cli_anything.gcloud.modules.compute.run_gcloud')
def test_compute_disks_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"name": "disk1"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(compute, ['disks', 'list', '--zone', 'us-west1-a'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['compute', 'disks', 'list', '--zone', 'us-west1-a']

@patch('cli_anything.gcloud.modules.compute.run_gcloud')
def test_compute_fail(mock_run):
    mock_run.return_value = {"success": False, "stdout": '', "stderr": "compute error"}
    runner = CliRunner()
    result = runner.invoke(compute, ['instances', 'list'])
    assert result.exit_code == 0
    assert 'compute error' in result.output
