"""
Main CLI entry point for lattice-cli.

Provides the top-level argparse structure and delegates each
command group to its own module.
"""

import argparse
import sys

from . import __version__
from . import auth, deploy, license, health, upgrade, backup


BANNER = f"""
  ╔═══════════════════════════════════════════════╗
  ║  Lattice OS CLI v{__version__:<33}║
  ║  Sovereign AI Infrastructure Management       ║
  ╚═══════════════════════════════════════════════╝
"""


def main():
    parser = argparse.ArgumentParser(
        prog="lattice",
        description="Lattice OS CLI — manage Docker appliance deployments",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  lattice auth login              Authenticate with Docker Hub
  lattice deploy start            Deploy Lattice OS container
  lattice deploy stop             Stop all services
  lattice license activate <key>  Activate enterprise license
  lattice health check            Verify deployment health
  lattice upgrade --tag v0.2.0    Upgrade to specific version
  lattice backup create           Snapshot config + volumes
  lattice backup list             Show available backups

Built by JJEM Global Technology, Inc.
        """,
    )
    parser.add_argument(
        "--version", "-v", action="version", version=f"lattice {__version__}"
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true", help="Suppress banner"
    )

    sub = parser.add_subparsers(dest="command", help="Command group")

    # ── Auth ──────────────────────────────────────────────────────────
    auth_parser = sub.add_parser("auth", help="Docker Hub authentication")
    auth_sub = auth_parser.add_subparsers(dest="subcommand")
    for name, spec in auth.get_subcommands().items():
        p = auth_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Deploy ────────────────────────────────────────────────────────
    deploy_parser = sub.add_parser("deploy", help="Container deployment")
    deploy_sub = deploy_parser.add_subparsers(dest="subcommand")
    for name, spec in deploy.get_subcommands().items():
        p = deploy_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── License ───────────────────────────────────────────────────────
    license_parser = sub.add_parser("license", help="License management")
    license_sub = license_parser.add_subparsers(dest="subcommand")
    for name, spec in license.get_subcommands().items():
        p = license_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Health ────────────────────────────────────────────────────────
    health_parser = sub.add_parser("health", help="Health checks and logs")
    health_sub = health_parser.add_subparsers(dest="subcommand")
    for name, spec in health.get_subcommands().items():
        p = health_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Upgrade ───────────────────────────────────────────────────────
    upgrade_parser = sub.add_parser("upgrade", help="Upgrade / rollback")
    upgrade_sub = upgrade_parser.add_subparsers(dest="subcommand")
    # The upgrade module exports top-level commands, not nested under a subcommand
    for name, spec in upgrade.get_subcommands().items():
        p = upgrade_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Backup ────────────────────────────────────────────────────────
    backup_parser = sub.add_parser("backup", help="Backup and restore")
    backup_sub = backup_parser.add_subparsers(dest="subcommand")
    for name, spec in backup.get_subcommands().items():
        p = backup_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    args = parser.parse_args()

    # No command given — show banner + help
    if not args.command:
        if not args.quiet:
            print(BANNER)
        parser.print_help()
        return 0

    # Command given but no subcommand — show subcommand help
    if not hasattr(args, "handler"):
        if not args.quiet:
            print(BANNER)
        sub_parsers = {
            "auth": auth_parser,
            "deploy": deploy_parser,
            "license": license_parser,
            "health": health_parser,
            "upgrade": upgrade_parser,
            "backup": backup_parser,
        }
        if args.command in sub_parsers:
            sub_parsers[args.command].print_help()
            return 0
        parser.print_help()
        return 0

    # Show banner unless --quiet
    if not args.quiet:
        print(BANNER)

    try:
        return args.handler(args) or 0
    except KeyboardInterrupt:
        print("\n  Interrupted.")
        return 130
    except Exception as e:
        print(f"\n  ✗ Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
