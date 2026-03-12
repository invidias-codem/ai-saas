# SUPABASE.md — CLI-Anything Agent Harness: Supabase

## Architecture Overview

This harness wraps the **Supabase CLI v2.75.0** (`/usr/local/bin/supabase`) with:

- Structured JSON output on every command (`--json` flag)
- A REPL mode for interactive agent sessions
- A clean Python Click CLI organized into logical command groups
- Full unit + E2E test coverage
- pip-installable via `pip install -e .` → `cli-anything-supabase`

---

## Command Groups

| Group       | Supabase commands wrapped                                          |
|-------------|---------------------------------------------------------------------|
| `project`   | `init`, `link`, `unlink`, `projects list`, `status`                |
| `db`        | `db push`, `db pull`, `db reset`, `db diff`, `db dump`, `db lint`  |
| `migration` | `migration new`, `migration list`, `migration up`, `migration repair`, `migration squash`, `migration down` |
| `functions` | `functions deploy`, `functions list`, `functions delete`, `functions serve`, `functions new`, `functions download` |
| `inspect`   | `inspect db table-stats`, `inspect db index-stats`, `inspect db locks`, `inspect db calls`, `inspect db outliers`, `inspect db long-running-queries`, `inspect db bloat`, `inspect db blocking`, `inspect db db-stats`, `inspect db vacuum-stats` |
| `storage`   | `storage ls`, `storage cp`, `storage mv`, `storage rm`            |
| `status`    | Overall project health (`supabase status`)                         |

---

## State Model

Session state is persisted in `~/.cli-anything/supabase/session.json`:

```json
{
  "project_ref": "abcdefghijklmnop",
  "workdir": "/path/to/project",
  "linked_at": "2025-01-01T00:00:00Z"
}
```

---

## Output Format

All commands support `--json` to return machine-readable structured output:

```json
{
  "success": true,
  "command": "db push",
  "stdout": "...",
  "stderr": "...",
  "returncode": 0,
  "data": {}
}
```

---

## Security

- **No `shell=True`** — all subprocess calls use `subprocess.run([binary, arg1, arg2, ...])` (execFileSync-style)
- Binary is resolved via `shutil.which('supabase')` — never hardcoded
- No credentials stored in session file

---

## Module Layout

```
cli_anything/supabase/
├── __init__.py            # Package init
├── supabase_cli.py        # Main Click CLI entry point
├── core/
│   ├── project.py         # project group commands
│   ├── migration.py       # migration group commands
│   ├── functions.py       # functions group commands
│   ├── db.py              # db group commands
│   └── inspect.py         # inspect group commands
├── utils/
│   ├── supabase_backend.py  # find_supabase(), run_supabase()
│   └── repl_skin.py         # REPL loop with prompt_toolkit
└── tests/
    ├── TEST.md
    ├── test_core.py         # Unit tests (no external deps)
    └── test_full_e2e.py     # E2E tests (real supabase binary)
```

---

## REPL Mode

```
$ cli-anything-supabase repl
╔══════════════════════════════════════╗
║  CLI-Anything: Supabase Agent REPL  ║
║  Type 'help' for commands, 'quit'   ║
╚══════════════════════════════════════╝
supabase> db status
supabase> migration list --json
supabase> quit
```

---

## Quick Start

```bash
pip install -e .
cli-anything-supabase --help
cli-anything-supabase project status
cli-anything-supabase db push --dry-run --json
cli-anything-supabase migration list --json
cli-anything-supabase repl
```
