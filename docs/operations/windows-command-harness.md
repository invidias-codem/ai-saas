# Native command execution

The Go harness provides an explicit shell contract for approved device commands.
It does not install an on-device model, connect Microsoft Copilot or Teams, or
provide an enterprise Windows installer. Those are separate integration layers.

## Shell contract

`IOHarness.executeCommandSecure(command, timeoutSeconds, workspaceId, userId, shell?)`
accepts these shell values:

| Shell | Behavior |
| --- | --- |
| omitted or `direct` | Run an executable with quoted arguments; no variable, pipe, or redirect expansion |
| `cmd` | Windows `cmd.exe /d /s /c` |
| `powershell` | Windows PowerShell with profiles disabled and a UTF-16 encoded script |
| `pwsh` | Installed PowerShell 7 with profiles disabled and a UTF-16 encoded script |
| `sh` | POSIX `sh -c`; unavailable on the Windows native path |

Shells never silently substitute for each other. Missing PowerShell 7 returns a
failure. CMD builtins such as `dir` require `shell: "cmd"`. Direct argument parsing
supports single/double quotes and literal Windows backslashes; it is a small
lexer, not a complete CMD, PowerShell, or POSIX shell grammar. For complex scripts,
select the shell explicitly. Native Windows command-line length limits still apply.

## Trusted host setup

Build the native daemon using Go from `go-harness`:

```powershell
go build -o bin/lattice-harness.exe ./cmd/lattice-harness
```

Point `LATTICE_HARNESS_BINARY_PATH` at the executable when using `GoIOHarness`.
That Node host generates a random per-instance RPC credential, supplies it to the
child daemon, and attaches it to requests. The credential is removed from executed
commands' environment. Other daemon launchers must independently configure
`LATTICE_AUTH_TOKEN`; the daemon's existing compatibility mode still allows an
unset token. Do not expose a compatibility-mode daemon outside a trusted host.

Before execution, the trusted host must hydrate the registry through the existing
`sync_root_grants` RPC with a root grant containing the authenticated `user_id`,
matching `workspace_id`, `read_only: false`, and `allow_destructive: true`. Obtain
those grants from the existing consent/identity source; never accept them from
model-generated tool arguments. Folder selection by itself does not grant
execution consent. Execution fails closed if identity, grant ownership, writable
access, or execution consent is absent.

The RPC `execute_command_secure` accepts:

```json
{
  "command": "Get-ChildItem -LiteralPath '.'",
  "shell": "powershell",
  "timeout_seconds": 30,
  "path": "C:\\Company\\Project",
  "workspace_id": "company-project",
  "user_id": "authenticated-employee"
}
```

The legacy RPC `run_command` is denied; callers must use the authenticated,
grant-checked route. Agent tools preserve their existing approval and sandbox
requirements. A POSIX quarantine runner rejects explicit native shell selection;
it cannot preview a Windows script by running it as `sh`. A trusted native host
must supply the harness after approval. Cloud approval-resume, device relay,
Copilot/Teams authentication, and installer wiring are not added by this change.
The legacy `ToolRouter` has no trusted identity context and consequently cannot
execute through the Go grant gate; use the agent tools with authenticated context.
The Node fallback refuses Windows execution or explicit shell selection.

## Results and process lifecycle

The daemon preserves combined stdout/stderr even on nonzero exit. Its result
`data` contains `shell`, `code`, `durationMs`, `isTimedOut`, `isCancelled`, and
`isTruncated`; `GoIOHarness` also exposes this as `meta`. Agent tools retain the
result on failure so callers can inspect diagnostics. Secure RPC output is bounded
to 10 KiB plus the truncation marker; timeout defaults to 30 seconds and is capped
at 120 seconds. Overflow, timeout, or HTTP request cancellation terminates the
managed process tree. Normal completion also cleans up background descendants.

Windows processes start suspended, join a kill-on-close Job Object, and resume
only after successful assignment. Job assignment failure aborts execution. POSIX
uses a process group. A process deliberately escaping a POSIX group requires
stronger OS isolation. Telemetry records status, duration, shell, and directory;
it does not record scripts, arguments, or output.

A working directory and Job Object are **not a filesystem or network sandbox**.
Commands execute with the host account's permissions and inherited environment
(except the daemon credential). They can access paths outside the selected folder.
Company file boundaries require an appropriately restricted OS account, container,
or other OS isolation. This implementation does not request elevation or bypass
PowerShell execution policy.

## Verification

```sh
go test -race ./internal/executil ./harness ./cmd/lattice-harness
```

The `Windows command harness` CI workflow runs native Windows and Linux tests for
shell selection, quoting, grant ownership, authenticated RPC, bounded output,
cancellation, descendant cleanup, and daemon credential exclusion. PowerShell 7
tests skip only when that optional executable is absent. Cross-compilation alone
does not establish Windows runtime correctness.
