"""
Organization inspection commands for lattice-cli.

Commands:
  lattice org status
  lattice org members
"""

import json
import sys
from urllib.request import urlopen, Request
from urllib.error import URLError

from .config import load_config


def _api_base() -> str:
    env_url = None
    try:
        from .main import require_env  # type: ignore
        env_url = require_env('LATTICE_API_URL')
    except Exception:
        pass
    return (env_url or 'http://localhost:3000').rstrip('/')


def _auth_headers() -> dict:
    token = ''
    try:
        from .main import parseCliEnv  # type: ignore
        env = parseCliEnv()
        token = env.authHeader
    except Exception:
        token = ''
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers


def _http_get(path: str):
    url = f"{_api_base()}{path}"
    headers = _auth_headers()
    try:
        req = Request(url, headers=headers)
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw)
    except (URLError, OSError, json.JSONDecodeError) as e:
        return {'error': str(e)}


def cmd_status(args):
    """Show current org context for the linked workspace."""
    workspace_id = getattr(args, 'workspaceId', None)
    if not workspace_id:
        print("missing --workspaceId")
        return 1

    ws_payload = _http_get(f"/api/workspaces/{workspace_id}")
    ws_error = ws_payload.get('error') if isinstance(ws_payload, dict) else None
    if ws_error:
        print(f"workspace lookup failed: {ws_error}")
        return 1

    workspace = ws_payload.get('workspace') or {}
    org_id = workspace.get('org_id')
    user_id = workspace.get('user_id')

    role = None
    permissions = []
    if org_id and user_id:
        member_payload = _http_get(f"/api/organization-members?org_id={org_id}&user_id={user_id}")
        if isinstance(member_payload, list) and member_payload:
            role = member_payload[0].get('role')
            permissions = member_payload[0].get('permissions', [])
        elif isinstance(member_payload, dict) and not member_payload.get('error'):
            role = member_payload.get('role')
            permissions = member_payload.get('permissions', [])

    role_display = role or 'none'
    print(f"workspace:      {workspace_id}")
    print(f"org_id:         {org_id or '-'}")
    print(f"actor_user_id:  {user_id or '-'}")
    print(f"role:           {role_display}")
    print(f"canUseSensitiveTools:   {'true' if 'sensitive_tools:use' in permissions else 'false'}")
    print(f"canUseExternalActions:  {'true' if 'external_actions:use' in permissions else 'false'}")
    return 0


def cmd_members(args):
    """List org members."""
    org_id = getattr(args, 'orgId', None)
    if not org_id:
        print("missing --orgId")
        return 1

    payload = _http_get(f"/api/organization-members?org_id={org_id}")
    if isinstance(payload, dict) and payload.get('error'):
        print(f"members lookup failed: {payload['error']}")
        return 1

    members = payload if isinstance(payload, list) else payload.get('members', [])
    if not members:
        print("no members found")
        return 0

    fmt = "{:<36} {:<12} {:<20}"
    print(fmt.format('user_id', 'role', 'fingerprint'))
    print(fmt.format('-' * 36, '-' * 12, '-' * 20))
    for m in members:
        print(fmt.format(
            str(m.get('user_id', '-')),
            str(m.get('role', '-')),
            str(m.get('fingerprint', m.get('user_id', '-'))),
        ))
    return 0


def get_subcommands():
    return {
        'status': {
            'help': 'Show org context for a workspace',
            'handler': cmd_status,
            'args': [
                (('--workspaceId',), {'help': 'Workspace UUID'}),
            ],
        },
        'members': {
            'help': 'List organization members',
            'handler': cmd_members,
            'args': [
                (('--orgId',), {'help': 'Organization UUID'}),
            ],
        },
    }
