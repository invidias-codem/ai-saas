# FIREBASE.md — CLI-Anything Agent Harness: Firebase

## Architecture Overview

This harness wraps the **Firebase CLI v15.9.1** with:

- Structured JSON output on every command (`--json` flag)
- A REPL mode with active project in prompt: `firebase[tech-genie-prod]>`
- A clean Python Click CLI organized into logical command groups
- Full unit + E2E test coverage (~55 unit + ~20 E2E tests)
- pip-installable via `pip install -e .` → `cli-anything-firebase`

---

## Command Groups

| Group       | Firebase commands wrapped                                                     |
|-------------|-------------------------------------------------------------------------------|
| `deploy`    | `deploy` (all, --only hosting, --only functions, --only firestore, preview channels) |
| `hosting`   | `hosting:channel:list/create/deploy/delete/clone`, `hosting:sites:list`       |
| `functions` | `functions:list`, `functions:log`, `functions:delete`, `functions:config:*`   |
| `firestore` | `firestore:indexes`, `firestore:locations`, `firestore:export/import/delete`  |
| `projects`  | `projects:list`, `projects:create`, `use`, `projects:addfirebase`             |
| `emulators` | `emulators:start`, `emulators:export`, `emulators:exec`                       |
| `apps`      | `apps:list`, `apps:create`, `apps:sdkconfig`, `apps:android:sha:*`            |

---

## State Model

Session state persisted in `~/.cli-anything/firebase/session.json`:

```json
{
  "project": "tech-genie-prod"
}
```

Active project resolution priority:
1. `-P` / `--project` CLI flag
2. `FIREBASE_PROJECT` environment variable
3. `.firebaserc` default alias in working directory
4. None (some commands work without a project)

---

## Output Format

All commands return structured JSON when `--json` is used:

```json
{
  "success": true,
  "command": "-P tech-genie-prod projects:list --json",
  "returncode": 0,
  "stdout": "...",
  "stderr": "",
  "data": { ... }
}
```

---

## Security

- **No `shell=True`** anywhere
- Binary resolved via `shutil.which('firebase')` with fallback to known nvm path
- No credentials stored in session file

---

## Module Layout

```
cli_anything/firebase/
├── __init__.py               # Package init
├── firebase_cli.py           # Main Click CLI entry point
├── core/
│   ├── __init__.py
│   ├── deploy.py             # deploy group
│   ├── hosting.py            # hosting group
│   ├── functions.py          # functions group
│   ├── firestore.py          # firestore group
│   ├── projects.py           # projects group
│   ├── emulators.py          # emulators group
│   └── apps.py               # apps group
├── utils/
│   ├── __init__.py
│   ├── firebase_backend.py   # find_firebase(), run_firebase(), FirebaseResult
│   └── repl_skin.py          # REPL loop with prompt_toolkit
└── tests/
    ├── __init__.py
    ├── test_unit.py          # ~55 unit tests (no external deps)
    └── test_e2e.py           # ~20 E2E tests (real firebase binary)
```

---

## REPL Mode

```
$ cli-anything-firebase repl

╔═══════════════════════════════════════════╗
║   CLI-Anything: Firebase Agent REPL       ║
║   Type 'help' for commands, 'quit' to exit║
╚═══════════════════════════════════════════╝
  Active project: tech-genie-prod

firebase[tech-genie-prod]> projects list
firebase[tech-genie-prod]> deploy hosting --dry-run
firebase[tech-genie-prod]> project staging
firebase[staging]> functions list
firebase[staging]> quit
```

---

## Quick Start

```bash
cd /Users/jroot/Desktop/ai-nexus/ai-saas/tools/agent-harnesses/firebase/agent-harness
pip install -e .
cli-anything-firebase --help
cli-anything-firebase status
cli-anything-firebase projects list
cli-anything-firebase --json deploy hosting
cli-anything-firebase repl
```
