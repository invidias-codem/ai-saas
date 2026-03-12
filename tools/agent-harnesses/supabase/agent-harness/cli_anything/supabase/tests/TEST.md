# TEST.md — CLI-Anything: Supabase Test Plan

## Overview

Two test files:
- `test_core.py` — Unit tests, no external deps (~60 tests)
- `test_full_e2e.py` — E2E tests against real supabase binary (~30 tests)

---

## Unit Tests: test_core.py (~60 tests)

### Backend (supabase_backend.py) — ~15 tests

| # | Test | Description |
|---|------|-------------|
| 1 | `test_find_supabase_returns_path` | `find_supabase()` returns a valid path string |
| 2 | `test_find_supabase_raises_when_missing` | raises RuntimeError when binary not found |
| 3 | `test_supabase_result_success_true` | returncode=0 → success=True |
| 4 | `test_supabase_result_success_false` | returncode=1 → success=False |
| 5 | `test_supabase_result_command_property` | command strips binary name from args |
| 6 | `test_supabase_result_parsed_valid_json` | parses valid JSON stdout |
| 7 | `test_supabase_result_parsed_invalid_json` | returns None for non-JSON stdout |
| 8 | `test_supabase_result_parsed_empty` | returns None for empty stdout |
| 9 | `test_supabase_result_to_dict_keys` | to_dict() contains all required keys |
| 10 | `test_run_supabase_no_shell_true` | subprocess.run is called without shell=True |
| 11 | `test_run_supabase_args_are_list` | args passed as list, not string |
| 12 | `test_run_supabase_captures_stdout` | stdout is captured in result |
| 13 | `test_run_supabase_captures_stderr` | stderr is captured in result |
| 14 | `test_run_supabase_json_appends_output_flag` | run_supabase_json adds --output json |
| 15 | `test_run_supabase_json_no_duplicate_flag` | doesn't duplicate --output if already present |

### Project Commands (core/project.py) — ~12 tests

| # | Test | Description |
|---|------|-------------|
| 16 | `test_project_list_calls_supabase` | invokes `projects list` |
| 17 | `test_project_list_json_output` | --json produces valid JSON |
| 18 | `test_project_list_json_has_required_keys` | JSON has success, command, data keys |
| 19 | `test_project_init_calls_supabase` | invokes `init` |
| 20 | `test_project_init_json_output` | --json mode works |
| 21 | `test_project_link_calls_supabase` | invokes `link --project-ref` |
| 22 | `test_project_link_saves_session` | writes session.json on success |
| 23 | `test_project_unlink_removes_session` | clears project_ref from session |
| 24 | `test_project_status_calls_supabase` | invokes `status` |
| 25 | `test_project_session_empty` | shows "No active session" when no session file |
| 26 | `test_project_session_with_data` | displays project_ref from session file |
| 27 | `test_load_session_missing_file` | returns empty dict when file missing |

### DB Commands (core/db.py) — ~10 tests

| # | Test | Description |
|---|------|-------------|
| 28 | `test_db_push_basic_args` | invokes `db push` |
| 29 | `test_db_push_dry_run_flag` | adds --dry-run flag |
| 30 | `test_db_push_json_output` | --json mode works |
| 31 | `test_db_pull_calls_supabase` | invokes `db pull` |
| 32 | `test_db_reset_calls_supabase` | invokes `db reset` |
| 33 | `test_db_diff_calls_supabase` | invokes `db diff` |
| 34 | `test_db_diff_linked_flag` | adds --linked flag |
| 35 | `test_db_dump_calls_supabase` | invokes `db dump` |
| 36 | `test_db_lint_calls_supabase` | invokes `db lint` |
| 37 | `test_db_push_include_all_flag` | adds --include-all |

### Migration Commands (core/migration.py) — ~10 tests

| # | Test | Description |
|---|------|-------------|
| 38 | `test_migration_new_calls_supabase` | invokes `migration new <name>` |
| 39 | `test_migration_new_json_has_name` | JSON includes migration_name |
| 40 | `test_migration_list_calls_supabase` | invokes `migration list` |
| 41 | `test_migration_list_local_flag` | adds --local flag |
| 42 | `test_migration_up_calls_supabase` | invokes `migration up` |
| 43 | `test_migration_down_calls_supabase` | invokes `migration down` |
| 44 | `test_migration_down_json_has_count` | JSON includes rolled_back count |
| 45 | `test_migration_repair_calls_supabase` | invokes `migration repair` |
| 46 | `test_migration_squash_calls_supabase` | invokes `migration squash` |
| 47 | `test_migration_fetch_calls_supabase` | invokes `migration fetch` |

### Functions Commands (core/functions.py) — ~8 tests

| # | Test | Description |
|---|------|-------------|
| 48 | `test_functions_deploy_calls_supabase` | invokes `functions deploy` |
| 49 | `test_functions_deploy_no_verify_jwt` | adds --no-verify-jwt |
| 50 | `test_functions_list_calls_supabase` | invokes `functions list` |
| 51 | `test_functions_delete_calls_supabase` | invokes `functions delete` |
| 52 | `test_functions_new_calls_supabase` | invokes `functions new` |
| 53 | `test_functions_download_calls_supabase` | invokes `functions download` |
| 54 | `test_functions_serve_json_mode_no_exec` | --json mode emits metadata, no subprocess |
| 55 | `test_functions_deploy_json_has_name` | JSON includes function_name |

### Inspect Commands (core/inspect.py) — ~5 tests

| # | Test | Description |
|---|------|-------------|
| 56 | `test_inspect_tables_calls_supabase` | invokes `inspect db table-stats` |
| 57 | `test_inspect_indexes_calls_supabase` | invokes `inspect db index-stats` |
| 58 | `test_inspect_locks_calls_supabase` | invokes `inspect db locks` |
| 59 | `test_inspect_bloat_calls_supabase` | invokes `inspect db bloat` |
| 60 | `test_inspect_local_flag` | --local adds --local to supabase args |

---

## E2E Tests: test_full_e2e.py (~30 tests)

These tests call the real `supabase` binary. Tests requiring a live project
are guarded with `@pytest.mark.skipif(not os.getenv('SUPABASE_PROJECT_REF'))`.

### Binary discovery — ~3 tests

| # | Test |
|---|------|
| 1 | `test_supabase_binary_found` |
| 2 | `test_supabase_version_returns_string` |
| 3 | `test_run_supabase_version_success` |

### CLI entry point — ~5 tests

| # | Test |
|---|------|
| 4 | `test_cli_help_exits_zero` |
| 5 | `test_cli_version_exits_zero` |
| 6 | `test_cli_version_json_output` |
| 7 | `test_project_group_help` |
| 8 | `test_db_group_help` |

### Project commands (no project required) — ~4 tests

| # | Test |
|---|------|
| 9 | `test_project_list_requires_auth_or_fails_gracefully` |
| 10 | `test_project_status_no_project_dir` |
| 11 | `test_project_session_no_session_file` |
| 12 | `test_project_session_json` |

### Migration commands — ~5 tests

| # | Test |
|---|------|
| 13 | `test_migration_new_creates_file` |
| 14 | `test_migration_list_no_project` |
| 15 | `test_migration_list_json` |
| 16 | `test_migration_up_local` |
| 17 | `test_migration_new_and_list_workflow` |

### DB commands (local) — ~5 tests

| # | Test |
|---|------|
| 18 | `test_db_push_dry_run` |
| 19 | `test_db_diff_local` |
| 20 | `test_db_lint_local` |
| 21 | `test_db_push_json` |
| 22 | `test_db_diff_json` |

### Functions commands — ~3 tests

| # | Test |
|---|------|
| 23 | `test_functions_new_creates_dir` |
| 24 | `test_functions_list_json` |
| 25 | `test_functions_serve_json_mode` |

### Inspect commands (requires linked project) — ~5 tests

| # | Test |
|---|------|
| 26 | `test_inspect_tables_linked` |
| 27 | `test_inspect_indexes_linked` |
| 28 | `test_inspect_locks_linked` |
| 29 | `test_inspect_db_stats_linked` |
| 30 | `test_inspect_bloat_linked` |

---

## Workflow Scenarios

### 1. Migration Lifecycle

```
migration new "add_users_table"
→ file created in supabase/migrations/

migration list --local
→ shows pending migration

db push --dry-run
→ shows migration would be applied

db push
→ applies migration to remote

migration list
→ shows migration as applied on remote
```

### 2. Function Deploy

```
functions new "hello-world"
→ creates supabase/functions/hello-world/index.ts

functions deploy hello-world
→ deploys to Supabase

functions list --json
→ shows hello-world in list

functions delete hello-world
→ removes from remote
```

### 3. DB Diff

```
# Make schema changes locally
db diff
→ shows SQL diff of pending changes

db diff --file "my_changes"
→ saves diff as a new migration file

migration list --local
→ new migration appears
```

---

## Test Results (Phase 6)

Run on: 2026-03-12 | Python 3.12.8 | pytest 9.0.2 | Supabase CLI 2.75.0

### Unit tests (test_core.py)

```
63 passed in 0.43s
```

All 63 unit tests pass with zero failures.

### E2E tests (test_full_e2e.py)

```
85 passed, 11 skipped in 8.86s
```

Skipped tests require one of:
- `SUPABASE_PROJECT_REF` — live Supabase project (auth + linked remote)
- `SUPABASE_LOCAL_RUNNING=1` — local Docker containers up (`supabase start`)

No failures. The `db diff` test was correctly moved behind `_NEEDS_LOCAL`
because `supabase db diff` waits for Docker and times out without containers.

### Combined

```
85 passed  |  11 skipped  |  0 failed
```

To run all tests with a live project:

```bash
SUPABASE_PROJECT_REF=<ref> python3 -m pytest cli_anything/supabase/tests/ -v
```

To run local container tests:

```bash
supabase start  # spin up local containers
SUPABASE_LOCAL_RUNNING=1 python3 -m pytest cli_anything/supabase/tests/ -v
```
