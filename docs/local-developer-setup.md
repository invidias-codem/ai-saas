# Local Developer Setup

This guide is for developers running Lattice OS locally and using the local CLI sandbox, `/api/cli/stream`, and `/api/memory/cli` directly. It covers environment setup, trust boundaries, and fastest verification paths.

## Prerequisites

- Node.js 18+ and `pnpm` installed
- Vercel CLI installed and authenticated
- A local or remote Lattice OS API base URL
- Optional: API token for `/api/cli/stream` when using the full sandbox path

## Environment Variables

Use `.env.local` for local overrides. The shipped example is `.env.local.example`.

Minimum local runtime vars:

```bash
LATTICE_API_URL=http://localhost:3000
LATTICE_USER_ID=local-dev
LATTICE_TOKEN=
LATTICE_CLI_TOKEN=
```

`LATTICE_USER_ID` is required. If it is missing, `bin/lattice-node` exits immediately.

## Local CLI Shim

The local entrypoint is `bin/lattice-node`.

```bash
./bin/lattice-node --local
./bin/lattice-node --local prompt "list files"
```

Behavior:
- Sends SSE requests to `/api/cli/stream`
- Parses `event: local_result` frames
- Executes approved commands through local Bash
- Logs rejected commands and returns structured JSON in-process

## Trusted Local Enclave: `.lattice/settings`

The CLI sandbox reads local settings from:

```
~/.lattice/settings
```

Create or edit this file to control local execution behavior.

### Minimum settings file

```
approved_commands=ls,cat,pwd,whoami,date,echo,git status,git diff
approval_mode=prompt
default_mode=fast
```

### `approved_commands`

Comma-separated commands the CLI will execute automatically under `--local`.

Examples:

```
approved_commands=ls,cat,pwd,whoami,date,echo,git status,git diff,find . -maxdepth 2 -type f
```

### `approval_mode`

Controls command authorization behavior for local execution.

Values:
- `prompt` — ask before executing commands not in `approved_commands`
- `auto` — execute all local commands without prompting
- `deny` — block all commands outside `approved_commands`

### `default_mode`

Optional local override for runtime behavior. This setting is not sent to the server.

Values:
- `fast`
- `quality`
- `agentic`
- `reasoning`

## Server-side CLI Routes

`/api/cli/stream` requires a bearer token when `LATTICE_CLI_TOKEN` is configured. Requests without a valid token return HTTP 401. `/api/memory/cli` uses the same token model for both read and write memory operations.

Example `/api/cli/stream` request:

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN" \
  -d '{"messages":[{"role":"user","text":"ping"}],"options":{}}'
```

Example `/api/memory/cli` request:

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN"
```

## Auto-Compaction

Lattice OS includes local compaction behavior to prevent context exhaustion during long sessions. Compaction is intended for local shell sessions and shell-driven automation that appends to local context.

Default behavior:
- High-water trigger: 92% of `LATTICE_CONTEXT_BUDGET_BYTES`
- Compacted context is flushed to a summary file under `~/.lattice/`

Environment overrides:
- `LATTICE_CONTEXT_HIGH_WATER` — default `92`
- `LATTICE_CONTEXT_LOW_WATER` — default `75`, reserved for future hysteresis
- `LATTICE_CONTEXT_BUDGET_BYTES` — default `120000`
- `LATTICE_CONTEXT_FILE` — default inside `LATTICE_HOME`

These settings are shell-only. They are not sent to the server.

## Troubleshooting

- `bin/lattice-node` exits immediately with `LATTICE_USER_ID is required` — set `LATTICE_USER_ID` in `.env.local`
- `/api/cli/stream` returns `401 Unauthorized` — ensure `LATTICE_CLI_TOKEN` matches on both client and server
- Local commands do not run — confirm the command is in `.lattice/settings` `approved_commands`, or use `approval_mode=prompt`

## Documentation Practices

This file is the source of truth for local developer setup. If setup steps or trust model change, update this file and the existing setup docs instead of leaving stale instructions in chat or session summaries.
