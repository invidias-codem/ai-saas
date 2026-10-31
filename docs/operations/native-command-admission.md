# S2c.5: command admission with qualified sandbox requirements

This slice adds closed command proposals, trusted executable/cwd preparation, exact native review and owned provider admission. **The production provider registry is empty. Every supported command dispatch returns `LOCAL_SANDBOX_REQUIRED` and launches no process.** The standalone legacy runner is not a native execution provider.

The source builds on S2c.4 #457. Human-reviewed parent integration, CodeQL and the S2c.6 native UI gate remain required. No Tauri command can dispatch commands, read command output, configure a provider or assert that a sandbox is qualified. The current desktop can record a review decision; it cannot execute it. No downloads, installer qualification, company enrollment or Copilot/Teams integration are added.

## Closed input and effective options

An `execute_command` proposal supplies a current opaque `grant_id`, portable relative cwd (including `.`), an explicit command choice and optional unsigned `timeout_seconds`. Paths cannot choose a different workspace/root. There are no environment, PATH, credentials, approval, provider or `requires_sandbox` inputs.

| Choice | Input and transport |
| --- | --- |
| `direct` | Executable basename and structured argv; at most 256 arguments and 64 KiB total bytes. No command-string splitting, substitutions or shell reinterpretation |
| `cmd` | Exact script, Windows only, `/d /s /c` arguments |
| `powershell` | Exact script, Windows PowerShell only, no profile/noninteractive UTF-16LE encoded-command transport |
| `pwsh` | Exact script, explicitly selected PowerShell 7 on Windows. Missing installation is unavailable; no installation or fallback |
| `sh` | Exact script and `-c` on Linux; no Windows substitution |

Scripts are at most 64 KiB, nonempty UTF-8 without NUL. Timeout defaults to 30 seconds and clamps to 120 seconds before review; output is fixed at 10 KiB. Native command preparation currently supports Windows/Linux. Unsupported platforms/shells and missing executables fail before review/admission.

The native daemon resolves the selected basename using its trusted environment, canonicalizes the actual executable and pins a no-follow/nonblocking file handle through a pinned parent. It accepts a bounded regular native binary (ELF on Linux, PE on Windows), not an implicit interpreter/batch fallback. Preparation binds full OS object identity, SHA3-256, byte count and resolved path; executable hashing is bounded to 64 MiB. System executable hardlinks are allowed; file-mutation hardlink restrictions are unchanged.

The cwd is walked component by component through the selected `os.Root`, refusing symlinks/reparse points and changed directory identities. The review retains cwd/executable handles. A selected read-only folder does not grant command execution: exact native acceptance and qualified provider admission are independently required. A qualified provider would have to preserve that read-only ceiling.

## Qualification is a trusted control-plane decision

`qualifiedCommandProvider` combines an internal qualification record with a backend implementation. The backend interface cannot self-register or self-attest. Every production `Session` constructor leaves this field nil; no JSON, environment, CLI, plugin or grant flag can set it. The test provider is instantiated only in Go tests, never exposed by the packaged daemon.

Qualification must bind provider ID, revision, supported platform and evidence hash, and require all of these properties:

| Requirement | Required behavior |
| --- | --- |
| Filesystem confinement | Only current permitted roots/files; preserve nested/read-only restrictions and destructive-policy limits |
| Network confinement | Enforce the native local policy, including denied network access |
| Non-elevated execution | Prevent elevation, inherited privileged authority and equivalent bypasses |
| Descendant ownership | Cancel, contain and join every owned descendant/resource |
| Workspace policy | Enforce current principal/workspace/generation and policy/grant revisions through execution |
| Pinned launch | Bind cwd and executable to the reviewed live objects through actual launch, not a separate path lookup |
| Clean environment | Use `native-clean-v1`: provider-owned clean environment, no inherited host/service/provider credentials or caller overrides |

`native-local-sandbox-v1` identifies this mandatory contract. Folder grants, a cwd, a Job Object/process group, a container label or an approval alone do not meet it. Test flags prove admission behavior, not real OS containment. Adding an actual provider requires reviewed implementation and platform/filesystem/network/privilege/cleanup qualification evidence; it must not route to the existing host command runner.

At dispatch, Go revalidates current qualification against the exact reviewed binding, resolves/rechecks the executable identity and content, and reopens the cwd through the current grant. The provider receives pinned cwd/executable handles and every current workspace root with its actual identity/read-only/destructive policy while the registry lock remains held. A future provider must establish those bindings in its isolated execution environment and launch without a path race; this slice does not claim that an ordinary path-based `exec` supplies that guarantee.

## Review and integrity

Native-generated IDs, authority, revisions, current root/permission, exact command bytes, cwd/executable identities, executable hash/path, effective argv, limits, clean environment policy and provider requirements/binding are immutable before review. Go prepares them; Rust independently validates effective arguments, timeout normalization and canonical SHA3-256 before storing the proposal.

The isolated schema-2 document adds an `execute_command` variant with `matches_command_scope`. Its metadata shows the complete effective scope, and its byte view shows exact script bytes or structured argv JSON bytes. Control/directional characters are escaped in all displayed JSON; the renderer uses text nodes, checks byte agreement, requires complete scrolling and explicit confirmation, and cannot dispatch. The main webview cannot provide a decision. Every execution attempt still consumes the native review lease once.

Command canonical encoding is v3; v1/v2 file fixtures are unchanged. Start with `LATTICE_NATIVE_PROPOSAL\0\x03`. Strings use u32 big-endian UTF-8 byte lengths; lists use a u32 count followed by string fields. Encode:

1. Proposal/principal/workspace/generation; u64 policy/grant revisions; grant/root; read-only byte; u32 300000; operation tag 4; cwd relative path.
2. Shell selector; direct executable basename and argv list, or exact script.
3. Platform; cwd volume/file; executable path/volume/file/SHA3-256; executable u64 byte count; effective argv list.
4. Effective timeout/output u32 values; environment policy; requirements; provider ID/u64 revision/evidence hash; required-sandbox byte 1.

Six independently Python-generated fixtures in `testdata/native-command-digests.json` cover all command modes, both OS identity widths, Unicode/control/UTF-16 transport, literal/empty argv, unavailable and test-qualified provider bindings, and effective limits. Rust and Go validate them independently. IDs/digests remain nonsecret references, not bearer approvals.

## Owned dispatch, output and cleanup

Commands and file mutations share the same 32 preparations, five monotonic minutes, one dispatch slot and 4,096 generation-long attempt records. Capacity refuses new admission without evicting replay protection. Typed command and mutation dispatch/status/cancel channels reject the other operation kind.

Rust consumes the stored exact acceptance and starts an owned task before awaiting its response. Go records the ID before provider admission/effects. An unqualified dispatch is a retained terminal denial, so a lost denial response can be reconciled by existing ID. Qualified test dispatches use the daemon lifecycle group and a separate effective execution context deadline. HTTP/caller disappearance never abandons the task; transport ambiguity causes status-only reconciliation, never automatic redispatch.

Command statuses add failed, timed-out and output-limited outcomes. Cancellation after provider admission may have changed files; it cannot promise rollback. Captured output is bounded UTF-8 text, returned through a separate native-only `native_command_output` call. It requires the exact current authority/grant revision and retained grant permission; revocation/revision changes deny the body while same-session status can retain non-content metadata. Scripts, argv, output and credentials are not logged.

If the provider cannot confirm descendant cleanup, Go publishes `LOCAL_CLEANUP_UNCONFIRMED` with `cleanup_pending` and possible effects, blocks new data/execution admission and retains registry/session locks, the shared slot and lifecycle work. Bounded cleanup attempts continue without abandoning ownership on cancellation. The normal five-second daemon shutdown allowance then fails rather than advertising a clean exit if cleanup remains unconfirmed; S2b blocks replacement after forced/uncertain cleanup. Even subsequent confirmation does not silently restore old authority: a clean restart is required. Rust also retains owned tracking while cleanup is pending. Session close/restart ends all old grants, reviews and result authority; durable recovery remains S4.

## Verification and remaining gates

Native startup requires the additional ordered `command-admission-v1` feature. Older four-feature daemons are incompatible. The private native allowlist adds only typed preparation/dispatch/status/cancel/output; legacy command routes and provider-registration bypasses remain denied behind unconditional launch authentication and strict JSON decoding.

Tests cover actual-daemon zero-launch denials for supported direct/shell modes, unavailable pwsh/no fallback, escaped exact review, independent digests, stale/forged authority and fields, replay, shared file/command admission, changed cwd/executable, mandatory qualification properties, deadline/cancellation, bounded/scoped output, revoked output and retained cleanup ownership. Internal fake-provider success/cancellation/cleanup tests do not qualify an OS sandbox. Preserve the S2b parent-loss, retired-token, restart and descendant-cleanup regressions alongside these checks.

Windows/Linux CI must validate the real daemon, native core, full Tauri ACLs, bundled renderer/CSP, Go/client regressions and CodeQL. Actual native UI qualification remains S2c.6. A production execution provider needs its own concrete qualification work before any command can launch. Packaged frontend, persistent memory/journal, installers and signed downloads remain S3–S6.
