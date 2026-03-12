import pytest
import os
from click.testing import CliRunner
from cli_anything.gcloud.gcloud_cli import cli

@pytest.mark.skipif(not os.getenv('GOOGLE_CLOUD_PROJECT'), reason='requires GCP project')
def test_e2e_projects_list():
    runner = CliRunner()
    result = runner.invoke(cli, ['projects', 'list'])
    assert result.exit_code == 0
    assert 'projectId' in result.output

@pytest.mark.skipif(not os.getenv('GOOGLE_CLOUD_PROJECT'), reason='requires GCP project')
def test_e2e_logging_read():
    runner = CliRunner()
    result = runner.invoke(cli, ['logging', 'read', '--limit', '1'])
    assert result.exit_code == 0
    # Should be valid JSON array
    assert result.output.strip().startswith('[')
    assert result.output.strip().endswith(']')
