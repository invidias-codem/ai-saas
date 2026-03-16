import pytest
import subprocess
from unittest.mock import patch
from cli_anything.gcloud.utils.gcloud_backend import run_gcloud, find_gcloud, get_default_project, parse_json_output

@patch('shutil.which')
@patch('os.path.exists')
def test_find_gcloud_which(mock_exists, mock_which):
    mock_which.return_value = '/usr/bin/gcloud'
    assert find_gcloud() == '/usr/bin/gcloud'

@patch('shutil.which')
@patch('os.path.exists')
def test_find_gcloud_fallback(mock_exists, mock_which):
    mock_which.return_value = None
    mock_exists.return_value = True
    assert 'bin/gcloud' in find_gcloud()

@patch('shutil.which')
@patch('os.path.exists')
def test_find_gcloud_default(mock_exists, mock_which):
    mock_which.return_value = None
    mock_exists.return_value = False
    assert find_gcloud() == 'gcloud'

@patch('subprocess.run')
def test_run_gcloud_success(mock_run):
    mock_run.return_value.returncode = 0
    mock_run.return_value.stdout = '{"ok": true}'
    mock_run.return_value.stderr = ''
    
    res = run_gcloud(['test'])
    assert res['success'] is True
    assert res['stdout'] == '{"ok": true}'
    assert res['returncode'] == 0
    
@patch('subprocess.run')
def test_run_gcloud_project_json(mock_run):
    mock_run.return_value.returncode = 0
    mock_run.return_value.stdout = ''
    mock_run.return_value.stderr = ''
    
    run_gcloud(['test'], project='my-proj')
    # Check if --project and --format json were added
    args = mock_run.call_args[0][0]
    assert '--project' in args
    assert 'my-proj' in args
    assert '--format' in args
    assert 'json' in args

@patch('subprocess.run')
def test_run_gcloud_failure(mock_run):
    mock_run.return_value.returncode = 1
    mock_run.return_value.stdout = ''
    mock_run.return_value.stderr = 'Error'
    
    res = run_gcloud(['test'])
    assert res['success'] is False
    assert res['stderr'] == 'Error'

@patch('subprocess.run')
def test_run_gcloud_exception(mock_run):
    mock_run.side_effect = Exception("OS Error")
    res = run_gcloud(['test'])
    assert res['success'] is False
    assert "OS Error" in res['stderr']

@patch('cli_anything.gcloud.utils.gcloud_backend.run_gcloud')
def test_get_default_project(mock_run):
    mock_run.return_value = {'success': True, 'stdout': 'my-proj\n'}
    assert get_default_project() == 'my-proj'

@patch('cli_anything.gcloud.utils.gcloud_backend.run_gcloud')
def test_get_default_project_fail(mock_run):
    mock_run.return_value = {'success': False, 'stdout': ''}
    assert get_default_project() is None

def test_parse_json_output():
    assert parse_json_output('{"k": "v"}') == {"k": "v"}
    
def test_parse_json_output_invalid():
    res = parse_json_output('invalid')
    assert "error" in res
    assert res["raw_output"] == 'invalid'

def test_parse_json_output_empty():
    assert parse_json_output('') == []
