'''Agent commands for lattice-cli.

Talks to the local Weaver runtime supervisor over a small TCP JSON-RPC
transport (newline-delimited frames) that the desktop and the CLI share.
Stdlib only: socket + json.
'''
from __future__ import annotations

import json
import os
import socket
import uuid
from typing import Any

PROTOCOL_VERSION = 1

DEFAULT_ADDR_FILE = os.path.expanduser("~/.lattice/supervisor.addr")
CLIENT_ID_FILE = os.path.expanduser("~/.lattice/client-id")


def _client_id() -> str:
    """Stable identity for this CLI installation, distinct from the desktop."""
    try:
        return open(CLIENT_ID_FILE).read().strip()
    except (OSError, FileNotFoundError):
        pass
    import uuid as _uuid
    cid = "cli-%s" % _uuid.uuid4().hex[:16]
    try:
        os.makedirs(os.path.dirname(CLIENT_ID_FILE), exist_ok=True)
        open(CLIENT_ID_FILE, "w").write(cid + "\n")
    except OSError:
        pass
    return cid


def _read_addr() -> str:
    """Resolve the supervisor address: env, then addr file, then a clear error."""
    addr = os.environ.get("LATTICE_SUPERVISOR_ADDR")
    if addr:
        return addr
    if os.path.exists(DEFAULT_ADDR_FILE):
        try:
            return open(DEFAULT_ADDR_FILE).read().strip()
        except OSError:
            pass
    raise SystemExit(
        "  x No local runtime supervisor address. Set LATTICE_SUPERVISOR_ADDR "
        "or start the desktop (it writes ~/.lattice/supervisor.addr)."
    )


def _hello(addr: str, timeout: float = 10.0) -> dict:
    """Perform the authenticated hello handshake; return the hello response."""
    host, port_s = addr.rsplit(":", 1)
    port = int(port_s)
    client_id = _client_id()
    frame = json.dumps({
        "id": "hello",
        "action": "hello",
        "inputs": {"client_id": client_id, "protocol_version": PROTOCOL_VERSION},
    }) + chr(10)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(frame.encode())
        buf = b""
        while b"\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
    reply = json.loads(buf.decode("utf-8", errors="replace").strip())
    if not reply.get("ok"):
        return {"error": reply.get("error", {"code": "LOCAL_RPC_ERROR", "message": "unknown"})}
    return reply.get("data", {})


def _rpc(addr: str, request: dict, timeout: float = 10.0) -> dict:
    """Open one connection, perform the authenticated hello, send one request."""
    host, port_s = addr.rsplit(":", 1)
    port = int(port_s)
    client_id = _client_id()
    hello = {
        "id": "hello",
        "action": "hello",
        "inputs": {"client_id": client_id, "protocol_version": PROTOCOL_VERSION},
    }
    frames = [hello, {**request, "id": uuid.uuid4().hex[:8]}]
    data = chr(10).join(json.dumps(f) for f in frames) + chr(10)
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.sendall(data.encode())
        buf = b""
        while buf.count(b"\n") < len(frames):
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
    results = []
    for line in buf.decode("utf-8", errors="replace").splitlines():
        if line.strip():
            results.append(json.loads(line))
    if len(results) < 2:
        return {"error": "incomplete response: got %d frames" % len(results)}
    hello_reply = results[0]
    if not hello_reply.get("ok"):
        return {"error": hello_reply.get("error", {"code": "LOCAL_HANDSHAKE_INVALID", "message": "handshake failed"})}
    reply = results[1]
    if not reply.get("ok"):
        return {"error": reply.get("error", {"code": "LOCAL_RPC_ERROR", "message": "unknown"})}
    return reply.get("data", {})


def cmd_connect(args) -> int:
    addr = args.addr or _read_addr()
    data = _hello(addr)
    if "error" in data:
        err = data["error"]
        print("  x Connect failed: %s %s" % (err.get("code"), err.get("message")))
        return 1
    print("  ok Connected to local runtime (session %s)" % data.get("session_id"))
    return 0


def cmd_session_create(args) -> int:
    addr = args.addr or _read_addr()
    data = _rpc(addr, {"action": "session.create", "inputs": {}})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    sid = data.get("session", {}).get("id")
    print("  ok Session created: %s" % sid)
    return 0


def cmd_session_list(args) -> int:
    addr = args.addr or _read_addr()
    data = _rpc(addr, {"action": "session.list", "inputs": {}})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    sessions = data.get("sessions", [])
    if not sessions:
        print("  (no sessions)")
        return 0
    for s in sessions:
        print("  %s  %s  client=%s" % (s.get("id"), s.get("status"), s.get("client_id")))
    return 0


def cmd_session_cancel(args) -> int:
    addr = args.addr or _read_addr()
    data = _rpc(addr, {"action": "session.cancel", "inputs": {"session_id": args.session_id}})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    print("  ok Session %s cancelled" % args.session_id)
    return 0


def cmd_event_append(args) -> int:
    addr = args.addr or _read_addr()
    payload = {}
    if args.payload:
        try:
            payload = json.loads(args.payload)
        except json.JSONDecodeError:
            payload = {"text": args.payload}
    data = _rpc(
        addr,
        {
            "action": "event.append",
            "inputs": {
                "session_id": args.session_id,
                "kind": args.kind,
                "payload": payload,
            },
        },
    )
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    ev = data.get("event", {})
    print("  ok Event appended: seq=%s kind=%s" % (ev.get("seq"), ev.get("kind")))
    return 0


def cmd_status(args) -> int:
    addr = args.addr or _read_addr()
    data = _rpc(addr, {"action": "status", "inputs": {}})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    print("  Local runtime status:")
    for key, value in data.items():
        print("    %s: %s" % (key, value))
    return 0


def cmd_agent_turn(args) -> int:
    addr = args.addr or _read_addr()
    try:
        proposal = json.loads(args.proposal)
    except json.JSONDecodeError:
        print("  x proposal must be valid JSON")
        return 1
    inputs = {"proposal": proposal}
    if args.idempotency_key:
        inputs["idempotency_key"] = args.idempotency_key
    data = _rpc(addr, {"action": "agent.turn", "inputs": inputs})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    print("  ok Turn proposed:")
    for key, value in data.items():
        print("    %s: %s" % (key, value))
    return 0


def cmd_agent_status(args) -> int:
    addr = args.addr or _read_addr()
    data = _rpc(addr, {"action": "agent.status", "inputs": {"operation_id": args.operation_id}})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    print("  ok Operation status:")
    for key, value in data.items():
        print("    %s: %s" % (key, value))
    return 0


def cmd_agent_cancel(args) -> int:
    addr = args.addr or _read_addr()
    data = _rpc(addr, {"action": "agent.cancel", "inputs": {"operation_id": args.operation_id}})
    if "error" in data:
        err = data["error"]
        print("  x %s: %s" % (err.get("code"), err.get("message")))
        return 1
    print("  ok Operation cancelled:")
    for key, value in data.items():
        print("    %s: %s" % (key, value))
    return 0


def get_subcommands() -> dict:
    addr_arg = (("--addr",), {"default": None, "help": "Supervisor address host:port"})
    return {
        "connect": {
            "help": "Authenticate to the local runtime supervisor and check the protocol version",
            "handler": cmd_connect,
            "args": [addr_arg],
        },
        "session": {
            "help": "Manage conversation sessions",
            "handler": None,
            "args": [],
            "sub": {
                "create": {
                    "help": "Create a new session",
                    "handler": cmd_session_create,
                    "args": [addr_arg],
                },
                "list": {
                    "help": "List sessions",
                    "handler": cmd_session_list,
                    "args": [addr_arg],
                },
                "cancel": {
                    "help": "Cancel a session",
                    "handler": cmd_session_cancel,
                    "args": [
                        (("session_id",), {"help": "Session id"}),
                        addr_arg,
                    ],
                },
            },
        },
        "event": {
            "help": "Append an event to a session",
            "handler": None,
            "args": [],
            "sub": {
                "append": {
                    "help": "Append an event to a session",
                    "handler": cmd_event_append,
                    "args": [
                        (("session_id",), {"help": "Session id"}),
                        (("kind",), {"help": "Event kind"}),
                        (("payload",), {"default": "{}", "help": "JSON payload or plain text"}),
                        addr_arg,
                    ],
                },
            },
        },
        "status": {
            "help": "Show local runtime status",
            "handler": cmd_status,
            "args": [addr_arg],
        },
        "turn": {
            "help": "Run one agent turn through the provider boundary",
            "handler": cmd_agent_turn,
            "args": [
                (("proposal",), {"help": "Proposal JSON (ExecuteCommand/CreateFile/WriteText/CreateDirectory)"}),
                (("--idempotency-key",), {"default": None, "help": "Idempotency key for safe retry"}),
                addr_arg,
            ],
        },
        "agent-status": {
            "help": "Show status of an in-flight or completed operation",
            "handler": cmd_agent_status,
            "args": [
                (("operation_id",), {"help": "Operation id"}),
                addr_arg,
            ],
        },
        "agent-cancel": {
            "help": "Cancel an in-flight operation",
            "handler": cmd_agent_cancel,
            "args": [
                (("operation_id",), {"help": "Operation id"}),
                addr_arg,
            ],
        },
    }
