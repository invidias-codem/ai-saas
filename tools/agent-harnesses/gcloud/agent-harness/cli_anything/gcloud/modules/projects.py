import click
from cli_anything.gcloud.utils.gcloud_backend import run_gcloud

@click.group()
def projects():
    """Manage Cloud Projects."""
    pass

@projects.command('list')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def projects_list(json):
    """List Google Cloud Projects."""
    res = run_gcloud(['projects', 'list'], use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@projects.command('describe')
@click.argument('project_id')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def projects_describe(project_id, json):
    """Describe a Google Cloud Project."""
    res = run_gcloud(['projects', 'describe', project_id], use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])
