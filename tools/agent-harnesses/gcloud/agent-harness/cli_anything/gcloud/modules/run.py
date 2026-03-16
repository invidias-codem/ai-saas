import click
from cli_anything.gcloud.utils.gcloud_backend import run_gcloud

@click.group(name='run')
def run_grp():
    """Manage Cloud Run."""
    pass

@run_grp.group()
def services():
    """Manage Cloud Run services."""
    pass

@services.command('list')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Run')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def services_list(project, region, json):
    """List Cloud Run services."""
    args = ['run', 'services', 'list']
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@services.command('describe')
@click.argument('service')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Run')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def services_describe(service, project, region, json):
    """Describe a Cloud Run service."""
    args = ['run', 'services', 'describe', service]
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@run_grp.group()
def revisions():
    """Manage Cloud Run revisions."""
    pass

@revisions.command('list')
@click.option('--service', help='Filter by service')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Run')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def revisions_list(service, project, region, json):
    """List Cloud Run revisions."""
    args = ['run', 'revisions', 'list']
    if service:
        args.extend(['--service', service])
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@run_grp.command('logs-read')
@click.argument('service')
@click.option('--project', help='Project ID to use')
@click.option('--region', help='Region for Cloud Run')
@click.option('--limit', type=int, help='Maximum number of logs to read', default=10)
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def logs_read(service, project, region, limit, json):
    """Read Cloud Run logs for a service."""
    args = ['run', 'services', 'logs', 'read', service, '--limit', str(limit)]
    if region:
        args.extend(['--region', region])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])
