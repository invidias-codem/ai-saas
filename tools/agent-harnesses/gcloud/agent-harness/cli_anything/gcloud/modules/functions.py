import click
from cli_anything.gcloud.utils.gcloud_backend import run_gcloud

@click.group()
def functions():
    """Manage Cloud Functions."""
    pass

@functions.command('list')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Functions')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def functions_list(project, region, json):
    """List Cloud Functions."""
    args = ['functions', 'list']
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@functions.command('describe')
@click.argument('function_name')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Functions')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def functions_describe(function_name, project, region, json):
    """Describe a Cloud Function."""
    args = ['functions', 'describe', function_name]
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@functions.command('logs-read')
@click.argument('function_name')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Functions')
@click.option('--limit', type=int, help='Maximum number of logs to read', default=10)
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def logs_read(function_name, project, region, limit, json):
    """Read logs for a Cloud Function."""
    args = ['functions', 'logs', 'read', function_name, '--limit', str(limit)]
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@functions.command('deploy')
@click.argument('function_name')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Functions')
@click.option('--trigger-http', is_flag=True, help='HTTP trigger')
@click.option('--runtime', help='Runtime to use')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def functions_deploy(function_name, project, region, trigger_http, runtime, json):
    """Deploy a Cloud Function."""
    args = ['functions', 'deploy', function_name]
    if region:
        args.extend(['--region', region])
    if trigger_http:
        args.append('--trigger-http')
    if runtime:
        args.extend(['--runtime', runtime])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])
