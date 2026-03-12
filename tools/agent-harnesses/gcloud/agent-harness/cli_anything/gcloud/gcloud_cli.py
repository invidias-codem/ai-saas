import click
import shlex
import sys
from cli_anything.gcloud.modules.logging import logging
from cli_anything.gcloud.modules.run import run_grp
from cli_anything.gcloud.modules.functions import functions
from cli_anything.gcloud.modules.compute import compute
from cli_anything.gcloud.modules.projects import projects
from cli_anything.gcloud.utils.gcloud_backend import get_default_project

@click.group()
def cli():
    """CLI-Anything harness for Google Cloud (gcloud)."""
    pass

cli.add_command(logging, name='logging')
cli.add_command(run_grp, name='run')
cli.add_command(functions, name='functions')
cli.add_command(compute, name='compute')
cli.add_command(projects, name='projects')

@cli.command()
@click.pass_context
def repl(ctx):
    """Start an interactive REPL for gcloud commands."""
    project = get_default_project()
    prompt_str = f"gcloud[{project}]> " if project else "gcloud> "
    
    click.echo(f"Starting gcloud REPL. Type 'exit' or 'quit' to leave.")
    while True:
        try:
            cmd = input(prompt_str)
        except EOFError:
            break
            
        cmd = cmd.strip()
        if not cmd:
            continue
        if cmd in ('exit', 'quit'):
            break
            
        args = shlex.split(cmd)
        
        try:
            # We use a standalone runner for the REPL to call commands
            cli.main(args=args, standalone_mode=False)
        except click.ClickException as e:
            e.show()
        except click.exceptions.Exit:
            pass
        except Exception as e:
            click.echo(f"Error: {e}", err=True)

if __name__ == '__main__':
    cli()
