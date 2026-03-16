from click.testing import CliRunner
from unittest.mock import patch
from cli_anything.gcloud.modules.projects import projects

@patch('cli_anything.gcloud.modules.projects.run_gcloud')
def test_projects_list(mock_run):
    mock_run.return_value = {"success": True, "stdout": '[{"projectId": "testproj"}]', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(projects, ['list'])
    assert result.exit_code == 0
    assert '[{"projectId": "testproj"}]' in result.output
    
    args = mock_run.call_args[0][0]
    assert args == ['projects', 'list']

@patch('cli_anything.gcloud.modules.projects.run_gcloud')
def test_projects_describe(mock_run):
    mock_run.return_value = {"success": True, "stdout": '{"projectId": "testproj"}', "stderr": ""}
    runner = CliRunner()
    result = runner.invoke(projects, ['describe', 'testproj'])
    assert result.exit_code == 0
    
    args = mock_run.call_args[0][0]
    assert args == ['projects', 'describe', 'testproj']

@patch('cli_anything.gcloud.modules.projects.run_gcloud')
def test_projects_fail(mock_run):
    mock_run.return_value = {"success": False, "stdout": '', "stderr": "proj error"}
    runner = CliRunner()
    result = runner.invoke(projects, ['list'])
    assert result.exit_code == 0
    assert 'proj error' in result.output
