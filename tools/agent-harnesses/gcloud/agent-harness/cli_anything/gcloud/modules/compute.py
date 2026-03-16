import click
from cli_anything.gcloud.utils.gcloud_backend import run_gcloud

@click.group()
def compute():
    """Manage Compute Engine."""
    pass

@compute.group()
def instances():
    """Manage Compute Engine instances."""
    pass

@instances.command('list')
@click.option('--project', help='Project ID to use')
@click.option('--zone', help='Zone for Compute instances')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def instances_list(project, zone, json):
    """List Compute Engine instances."""
    args = ['compute', 'instances', 'list']
    if zone:
        args.extend(['--zone', zone])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@instances.command('describe')
@click.argument('instance_name')
@click.option('--project', help='Project ID to use')
@click.option('--zone', help='Zone for Compute instance')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def instances_describe(instance_name, project, zone, json):
    """Describe a Compute Engine instance."""
    args = ['compute', 'instances', 'describe', instance_name]
    if zone:
        args.extend(['--zone', zone])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])

@compute.group()
def disks():
    """Manage Compute Engine disks."""
    pass

@disks.command('list')
@click.option('--project', help='Project ID to use')
@click.option('--zone', help='Zone for Compute disks')
@click.option('--json', is_flag=True, default=True, help='Output as JSON')
def disks_list(project, zone, json):
    """List Compute Engine disks."""
    args = ['compute', 'disks', 'list']
    if zone:
        args.extend(['--zone', zone])
    res = run_gcloud(args, project=project, use_json=json)
    click.echo(res['stdout'] if res['success'] else res['stderr'])
