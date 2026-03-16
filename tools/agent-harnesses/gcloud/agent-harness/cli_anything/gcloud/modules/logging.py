import click
import json
from cli_anything.gcloud.utils.gcloud_backend import run_gcloud, parse_json_output

@click.group()
def logging():
    """Manage Cloud Logging."""
    pass

@logging.command('read')
@click.option('--project', help='Project ID to use')
@click.option('--limit', type=int, help='Maximum number of logs to read')
@click.option('--filter', 'log_filter', help='Filter string for logs')
@click.option('--freshness', help='Time relative to now (e.g., 1d, 1h)')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def read(project, limit, log_filter, freshness, json):
    """Read log entries."""
    args = ['logging', 'read']
    if log_filter:
        args.append(log_filter)
    if limit:
        args.extend(['--limit', str(limit)])
    if freshness:
        args.extend(['--freshness', freshness])
        
    res = run_gcloud(args, project=project, use_json=json)
    
    if json and res['success']:
        click.echo(res['stdout'])
    else:
        click.echo(res['stdout'] if res['success'] else res['stderr'])

@logging.command('tail')
@click.option('--project', help='Project ID to use')
@click.option('--filter', 'log_filter', help='Filter string for logs')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def tail(project, log_filter, json):
    """Tail log entries. Note: Tailing in harness mode is mapped to reading recent logs instead of a blocking tail."""
    args = ['logging', 'read']
    if log_filter:
        args.append(log_filter)
    args.extend(['--limit', '10', '--freshness', '1h'])
        
    res = run_gcloud(args, project=project, use_json=json)
    
    if json and res['success']:
        click.echo(res['stdout'])
    else:
        click.echo(res['stdout'] if res['success'] else res['stderr'])

@logging.command('metrics-list')
@click.option('--project', help='Project ID to use')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def metrics_list(project, json):
    """List log metrics."""
    res = run_gcloud(['logging', 'metrics', 'list'], project=project, use_json=json)
    if json and res['success']:
        click.echo(res['stdout'])
    else:
        click.echo(res['stdout'] if res['success'] else res['stderr'])

@logging.command('sinks-list')
@click.option('--project', help='Project ID to use')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def sinks_list(project, json):
    """List log sinks."""
    res = run_gcloud(['logging', 'sinks', 'list'], project=project, use_json=json)
    if json and res['success']:
        click.echo(res['stdout'])
    else:
        click.echo(res['stdout'] if res['success'] else res['stderr'])
