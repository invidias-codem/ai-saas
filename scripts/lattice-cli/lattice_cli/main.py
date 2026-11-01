"""
Main CLI entry point for lattice-cli.

Provides the top-level argparse structure and delegates each
command group to its own module.
"""

import argparse
import sys

from . import __version__
from . import auth, deploy, license, health, upgrade, backup, crypto_license, org, task, doctor, agent


BANNER = f"""
  ╔═══════════════════════════════════════════════╗
  ║  Lattice OS CLI v{__version__:<33}║
  ║  Sovereign AI Infrastructure Management       ║
  ╚═══════════════════════════════════════════════╝
"""


def main():
    # Keep redirected output predictable on Windows as well as in terminals.
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr):
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(encoding="utf-8", errors="replace")
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

    doctor_parser = sub.add_parser("doctor", help="Check CLI integrity and deployment prerequisites")
    doctor_parser.add_argument("--offline", action="store_true", help="Check CLI runtime only; do not contact Docker")
    doctor_parser.add_argument("--json", action="store_true", help="Machine-readable diagnostics")
    doctor_parser.set_defaults(handler=doctor.cmd_doctor)

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

    # ── Dev (internal crypto tools) ───────────────────────────────────
    crypto_parser = sub.add_parser("dev", help="Internal dev tools (JJEM use only)")
    crypto_sub = crypto_parser.add_subparsers(dest="subcommand")
    for name, spec in crypto_license.get_subcommands().items():
        p = crypto_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Org ────────────────────────────────────────────────────────────
    org_parser = sub.add_parser("org", help="Organization/tenant controls")
    org_sub = org_parser.add_subparsers(dest="subcommand")
    for name, spec in org.get_subcommands().items():
        p = org_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Task ────────────────────────────────────────────────────────────
    task_parser = sub.add_parser("task", help="Agent task execution")
    task_sub = task_parser.add_subparsers(dest="subcommand")
    for name, spec in task.get_subcommands().items():
        p = task_sub.add_parser(name, help=spec["help"])
        for flags, kwargs in spec["args"]:
            p.add_argument(*flags, **kwargs)
        p.set_defaults(handler=spec["handler"])

    # ── Agent ───────────────────────────────────────────────────────────
    agent_parser = sub.add_parser("agent", help="Local agent runtime (supervisor client)")
    agent_sub = agent_parser.add_subparsers(dest="subcommand")
    for name, spec in agent.get_subcommands().items():
        if spec.get("sub"):
            nested = agent_sub.add_parser(name, help=spec["help"])
            nested_sub = nested.add_subparsers(dest="subcommand2")
            for nname, nspec in spec["sub"].items():
                np = nested_sub.add_parser(nname, help=nspec["help"])
                for flags, kwargs in nspec["args"]:
                    np.add_argument(*flags, **kwargs)
                np.set_defaults(handler=nspec["handler"])
        else:
            p = agent_sub.add_parser(name, help=spec["help"])
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
            "dev": crypto_parser,
            "org": org_parser,
            "task": task_parser,
            "agent": agent_parser,
            }
        if args.command in sub_parsers:
            sub_parsers[args.command].print_help()
            return 0
        parser.print_help()
        return 0

    # Show banner unless --quiet
    if not args.quiet and not getattr(args, "json", False):
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
