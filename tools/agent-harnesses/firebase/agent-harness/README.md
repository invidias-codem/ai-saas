# CLI-Anything: Firebase Agent Harness

A Python CLI harness wrapping the **Firebase CLI (v15.9.1)** for agent automation.

## Features

- Structured JSON output on every command (`--json` flag)
- Active-project REPL: `firebase[tech-genie-prod]>`
- All commands organized into logical Click groups
- No `shell=True` anywhere — subprocess-safe
- Default project resolution: `FIREBASE_PROJECT` env → `.firebaserc`
- pip-installable: `pip install -e .` → `cli-anything-firebase`

## Quick Start

```bash
pip install -e .
cli-anything-firebase --help
cli-anything-firebase status
cli-anything-firebase projects list
cli-anything-firebase --json projects list
cli-anything-firebase -P my-project deploy hosting
cli-anything-firebase repl
```

## Command Groups

| Group       | Commands                                                      |
|-------------|---------------------------------------------------------------|
| `deploy`    | `all`, `hosting`, `functions`, `firestore`, `preview-channel` |
| `hosting`   | `channel-list`, `channel-create`, `channel-deploy`, `channel-delete`, `channel-clone`, `sites-list` |
| `functions` | `list`, `log`, `delete`, `config-get`, `config-set`, `config-unset` |
| `firestore` | `indexes`, `locations`, `export`, `import`, `delete`, `rules` |
| `projects`  | `list`, `create`, `use`, `info`, `add-firebase`               |
| `emulators` | `start`, `export`, `exec`                                     |
| `apps`      | `list`, `create`, `sdkconfig`, `android-sha-list`, `android-sha-create` |

## Environment

```bash
export FIREBASE_PROJECT=tech-genie-prod  # default project
```

Or add a `.firebaserc` in your working directory:

```json
{
  "projects": {
    "default": "tech-genie-prod"
  }
}
```

## REPL

```
$ cli-anything-firebase repl

╔═══════════════════════════════════════════╗
║   CLI-Anything: Firebase Agent REPL       ║
║   Type 'help' for commands, 'quit' to exit║
╚═══════════════════════════════════════════╝

firebase[tech-genie-prod]> projects list
firebase[tech-genie-prod]> deploy hosting
firebase[tech-genie-prod]> project staging-project
firebase[staging-project]> functions list
firebase[staging-project]> quit
```

## JSON Output (Machine-Readable)

```bash
cli-anything-firebase --json projects list
# →
{
  "success": true,
  "command": "-P tech-genie-prod projects:list --json",
  "returncode": 0,
  "stdout": "...",
  "stderr": "",
  "data": { ... }
}
```

## Running Tests

```bash
# Unit tests only (no Firebase project needed)
pytest cli_anything/firebase/tests/test_unit.py -v

# E2E tests (requires firebase binary)
pytest cli_anything/firebase/tests/test_e2e.py -v

# Full suite with live project
FIREBASE_PROJECT=tech-genie-prod pytest -v
```

## Security

- **No `shell=True`** — all subprocess calls use `subprocess.run([binary, ...])` 
- Binary resolved via `shutil.which('firebase')` with fallback to known path
- No credentials stored in session files
