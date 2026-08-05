"""
Task runner commands for lattice-cli.

Provides real-time streaming execution via /api/v1/tasks/* SSE endpoints.
"""
from __future__ import annotations

import json
import sys
from http.client import HTTPConnection
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import load_config


# ── ANSI Palette ──────────────────────────────────────────────────────
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"


def _http_json(url: str, method: str = "GET", payload: dict | None = None, token: str = "") -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        return {"error": f"HTTP {e.code}", "body": e.read().decode("utf-8", errors="replace")}
    except URLError as e:
        return {"error": str(e)}


def _render_info(payload: dict) -> str | None:
    message = payload.get("message")
    if message == "stream_started":
        return f"{DIM}  streaming {payload.get('taskId', '?')}{RESET}"
    return None


def _render_task_update(payload: dict) -> str | None:
    status = payload.get("status", "?")
    result = payload.get("result")
    error = payload.get("error")

    if status == "completed":
        try:
            parsed = json.loads(result) if isinstance(result, str) else result
        except Exception:
            parsed = result
        if isinstance(parsed, dict) and parsed.get("success") and isinstance(parsed.get("data"), list):
            return f"{GREEN}{BOLD}  ✔ COMPLETED{RESET} — returned {len(parsed['data'])} item(s)"
        return f"{GREEN}{BOLD}  ✔ COMPLETED{RESET}"

    if status == "failed":
        return f"{RED}{BOLD}  ✖ FAILED{RESET} — {error or 'unknown error'}"

    if status == "running":
        return f"{YELLOW}{BOLD}  ⟳ RUNNING{RESET}"

    return f"  {status.upper()}"


def _render_audit_row(payload: dict) -> str | None:
    event_type = payload.get("event_type", "?")
    decision = payload.get("decision", "?")
    audit_payload = payload.get("payload") or {}
    harness = audit_payload.get("harness") or audit_payload.get("tool") or ""
    if not harness:
        # infer from event_type
        harness = event_type.split(".")[0] if "." in event_type else event_type

    decision_fmt = {
        "ALLOW": f"{GREEN}{BOLD}ALLOW{RESET}",
        "DENY": f"{RED}{BOLD}DENY{RESET}",
    }.get(decision, decision)

    if event_type == "tool.executed":
        return f"{CYAN}{BOLD}  ⚡ EXECUTED{RESET} [{harness}] — {decision_fmt}"
    if event_type == "tool.intercepted":
        reason = audit_payload.get("reason", "Access Denied")
        return f"{RED}{BOLD}  ✖ INTERCEPTED{RESET} [{harness}] — {decision_fmt}: {reason}"
    if event_type == "agent.task.completed":
        return f"{GREEN}{BOLD}  ✔ TASK COMPLETED{RESET}"
    if event_type == "agent.task.failed":
        err = audit_payload.get("error") or audit_payload.get("reason") or "unknown"
        return f"{RED}{BOLD}  ✖ TASK FAILED{RESET} — {err}"
    if event_type == "agent.task.cancelled":
        return f"{YELLOW}{BOLD}  ⚑ TASK CANCELLED{RESET}"

    return f"{DIM}  audit {event_type} {decision_fmt}{RESET}"


def cmd_run(args) -> int:
    """Run an agentic task and stream live events."""
    config = load_config()
    port = args.port or 3000
    token = args.token or config.get("partner_key", "")
    task_type = args.type or "evaluation"
    workspace_id = args.workspace_id or config.get("workspace_id", "")

    if not token:
        print("  ✗ Missing partner token. Set LATTICE_PARTNER_KEY or config partner_key.")
        return 1

    if not workspace_id:
        print("  ✗ Missing workspace_id. Pass --workspace-id or set config workspace_id.")
        return 1

    prompt = " ".join(args.prompt)
    if not prompt:
        print("  ✗ No task prompt provided.")
        return 1

    base = f"http://localhost:{port}"

    print(f"  Creating {task_type} task ...")
    created = _http_json(
        f"{base}/api/v1/tasks",
        method="POST",
        payload={
            "task_type": task_type,
            "input": prompt,
            "workspace_id": workspace_id,
            "context": {
                "origin": "lattice-cli",
                "preferred_task_id": args.task_id or "",
            },
        },
        token=token,
    )

    if created.get("error"):
        print(f"  ✗ Failed to create task: {created['error']}")
        if "body" in created:
            print(f"    {created['body']}")
        return 1

    task_id = created.get("task_id")
    if not task_id:
        print(f"  ✗ Unexpected response: {created}")
        return 1

    print(f"  Task queued: {task_id}")
    print(f"  {'─' * 50}")

    url = f"{base}/api/v1/tasks/{task_id}/stream"
    conn = HTTPConnection("localhost", port, timeout=10)
    try:
        conn.putrequest("GET", f"/api/v1/tasks/{task_id}/stream")
        conn.putheader("Authorization", f"Bearer {token}")
        conn.putheader("Accept", "text/event-stream")
        conn.endheaders()
        res = conn.getresponse()
        if res.status != 200:
            body = res.read().decode("utf-8", errors="replace")
            print(f"  ✗ Stream failed: HTTP {res.status} {res.reason}")
            if body:
                print(body)
            return 1

        buf = b""
        current_event = None
        try:
            while True:
                chunk = res.read(4096)
                if not chunk:
                    break
                buf += chunk
                text = buf.decode("utf-8", errors="replace")
                if "\n\n" in text:
                    parts = text.split("\n\n")
                    for p in parts[:-1]:
                        for line in p.splitlines():
                            stripped = line.strip()
                            if stripped.startswith("event:"):
                                current_event = stripped.split(":", 1)[1].strip()
                                continue
                            if stripped.startswith("data:"):
                                payload_raw = stripped.split(":", 1)[1].strip()
                                try:
                                    payload = json.loads(payload_raw)
                                except json.JSONDecodeError:
                                    payload = {"raw": payload_raw}

                                rendered = None
                                if current_event:
                                    try:
                                        renderer = {
                                            "info": _render_info,
                                            "task.update": _render_task_update,
                                            "audit.row": _render_audit_row,
                                        }[current_event]
                                        rendered = renderer(payload)
                                    except Exception:
                                        rendered = f"  {current_event}: {payload}"
                                else:
                                    rendered = f"  {payload}"

                                if rendered is not None:
                                    print(rendered)
                    buf = parts[-1].encode("utf-8", errors="replace")
        finally:
            conn.close()
            if buf:
                text = buf.decode("utf-8", errors="replace")
                for line in text.splitlines():
                    stripped = line.strip()
                    if stripped.startswith("data:"):
                        payload_raw = stripped.split(":", 1)[1].strip()
                        try:
                            payload = json.loads(payload_raw)
                        except json.JSONDecodeError:
                            payload = {"raw": payload_raw}
                        rendered = f"  {payload}"
                        print(rendered)

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"  ✗ Stream failed: HTTP {e.code} {e.reason}")
        if body:
            print(body)
        return 1
    except URLError as e:
        print(f"  ✗ Stream failed: {e}")
        return 1

    print(f"  {'─' * 50}")

    final = _http_json(f"{base}/api/v1/tasks?task_id={task_id}", token=token)
    tasks = final.get("tasks") or []
    task = next((t for t in tasks if t.get("id") == task_id), tasks[0] if tasks else None)
    if task:
        status = task.get("status", "?")
        print(f"  Final status: {status}")
        if task.get("result"):
            try:
                parsed = json.loads(task["result"]) if isinstance(task["result"], str) else task["result"]
                if isinstance(parsed, dict) and parsed.get("success"):
                    data = parsed.get("data") or []
                    print(f"  Result: {len(data)} item(s) returned")
                else:
                    print(f"  Result: {str(task['result'])[:1200]}")
            except Exception:
                print(f"  Result: {str(task['result'])[:1200]}")
        if task.get("error"):
            print(f"  Error: {task['error']}")

    return 0


def get_subcommands() -> dict:
    return {
        "run": {
            "help": "Run an agent task and stream live output",
            "handler": cmd_run,
            "args": [
                (("prompt",), {"nargs": "+", "help": "Task prompt text"}),
                (("--type", "-t"), {"default": "evaluation", "help": "Task type: reasoning|generation|evaluation|transformation"}),
                (("--workspace-id", "-w"), {"default": "", "help": "Workspace UUID"}),
                (("--task-id",), {"default": "", "help": "Preferred task UUID, if any"}),
                (("--token",), {"default": "", "help": "Partner bearer token"}),
                (("--port", "-p"), {"type": int, "default": 0, "help": "Local API port"}),
            ],
        }
    }
