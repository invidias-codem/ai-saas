# S2c.4: guarded native file mutations

This slice adds the native Rust/Go mutation broker. It supports exclusive file creation, directory creation and checked UTF-8 overwrites. Folder selection still starts read-only, and every mutation needs its own exact native acceptance after separate write consent.

**Desktop qualification gate:** write consent, dispatch, operation status and cancellation have native core APIs but no registered Tauri commands or frontend execution methods. The native dialog adapter is implemented; actual WebKit/WebView2 picker/review qualification in S2c.6 must precede enabling privileged file-changing UI. `execution_available` remains false. An acceptance in the current desktop records a decision without applying it. MockRuntime and Chromium policy tests do not qualify an installed app.

The base is S2c.3 [#456](https://github.com/invidias-codem/ai-saas/pull/456), following S2c.2 #455. Main has integrated #454's identical authority source. Human-reviewed parent integration and current checks remain required; no automatic merge is enabled.

## Permission and preparation

`RpcSession::request_write_access` accepts an opaque current grant ID and a trusted native `WriteConsent` adapter. No webview supplies a path, permission flag or confirmation boolean. The broker opens and retains the actual directory, compares its OS identity with the selected grant, displays the real path, rechecks it after consent, then installs a complete next-revision snapshot. A denied confirmation changes nothing. A successful elevation invalidates all older reviews and Go preparations. Destructive permissions and commands remain unavailable.

Preparation passes a native-generated proposal ID and closed typed operation to `native_prepare_mutation` through Rust's private authenticated session. Go obtains the actual grant path/permission, pins the parent and captures overwrite base data. Rust verifies the returned operation, authority, grant/root/permission, complete base/hash and canonical digest against its original request before storing an immutable review. It starts the native monotonic expiry before preparation, so transport time does not extend approval lifetime.

| Operation | Reviewed target contract |
| --- | --- |
| `create_file` | Relative non-root path, parent OS identity, target absent, exact UTF-8 content up to 256 KiB without NUL; exclusive creation with mode 0600 |
| `create_directory` | Relative non-root path, parent OS identity, target absent; one directory with mode 0700, without implicit parent creation |
| `write_text` | Relative non-root path, parent and file OS identities, complete current UTF-8 base, SHA3-256 and byte count, plus exact replacement bytes under the same text bound |

Caller-supplied base data, identities, approval flags and replacement intent at dispatch are rejected. Preparation has no filesystem side effects and confers no approval. Go retains parent/base handles for the preparation lifetime to prevent identity recycling while the review is pending; denial/cancellation, expiry, grant changes and shutdown release them.

The isolated review document is schema 2. It shows escaped paths, parent/base identities and the base hash, complete before/after quoted JSON, and their complete UTF-8 hexadecimal bytes. The bundled renderer checks byte agreement before acknowledgement, uses text nodes, requires scrolling each long byte view plus explicit confirmation, and submits one exact decision. Incomplete or changed before/after data denies display.

## Dispatch ownership and outcomes

Rust holds one dispatch permit and an owned grant read guard, consumes the stored exact acceptance against current scope/permission/expiry, and records an initially uncertain outcome before spawning its owned task. It sends exactly one `native_dispatch_mutation` request containing only `{ proposal_id, digest }`. There is no caller-selected dispatch payload and no generic RPC route.

Go independently checks bound principal/workspace/generation, current policy/grant revisions, the prepared digest, expiry, permission and capacity. Under its operation mutex it records the ID as running before any effect, then starts work registered with the daemon lifecycle group. The session/registry read locks stay held through admitted work, so permission updates close new admission and wait before acknowledgement. HTTP disconnection does not cancel the owned mutation. Shutdown cancels and joins tracked work; unconfirmed cleanup retains the S2b restart block.

| Status | Meaning |
| --- | --- |
| `running` | Go admitted the operation; no terminal result has been observed |
| `succeeded` | The supported operation completed and its file writes were synced |
| `conflict` | A target/base/identity/absence condition failed before an effect |
| `denied` | Permission or admission refused the attempt before effects |
| `cancelled` | Cancellation was observed before effects; it does not mean an earlier effect was undone |
| `outcome_unknown` | Transport/result uncertainty or a filesystem failure that may have left effects; no automatic mutation retry |

After a lost/invalid dispatch response, Rust retains the task, permit and grant guard and queries only `native_mutation_status` for that existing ID. A confirmed terminal result releases ownership; an unresolved transport outcome blocks new mutations/permission updates until reconciliation or clean shutdown. Status/cancellation replies must match the stored ID/digest and closed state/code schema. Observed terminal success/conflict/denial/cancellation cannot regress to running or transport uncertainty. A Go-observed partial-result unknown is terminal work with possible effects; it still cannot replay the old ID.

`native_cancel_mutation` signals owned work and returns its observed state. A completed write remains succeeded, and cancellation cannot promise reversal. Operation status after grant revocation contains only ID/digest/status metadata for the same current session, never file bodies or another workspace's data. Closed/restarted sessions cannot return old cached results.

Bounds are 32 preparations, five monotonic minutes, one active native review, one admitted mutation per workspace and 4,096 generation-long attempted IDs. Replays are refused; reaching attempt capacity blocks further admission instead of evicting IDs. These are at-most-one live-generation attempts, not exactly-once effects across crashes. S4 must supply durable journals and interrupted-task reconciliation.

## Filesystem semantics and limits

All effects use Go's existing pinned `os.Root` registry. Portable path validation refuses traversal, absolute/drive/UNC/device/stream/URI forms and grant-root mutation. The parent walk opens each component without following links, checks the opened identity against the pinned root and refuses actual nested read-only directory identities, including moved nested roots. Mutations also verify that the displayed selected root path still names the pinned root; renamed roots can remain readable under S2c.2 but cannot silently receive reviewed mutations under an obsolete display path.

Unix uses single-component `openat` on a file handle opened from the pinned root, with no-follow and nonblocking flags. Passing `O_NOFOLLOW` to `os.Root.OpenFile` alone is insufficient because Go deliberately resolves in-root symlinks; the descriptor-relative syscall enforces this slice's stricter link refusal. Windows uses relative `NtCreateFile` against the pinned parent, opens reparse points as themselves and refuses them; file identity uses the full 128-bit `FileIdInfo` plus volume ID. Missing identities fail closed. Regular overwrite targets must have one hard link; special files and linked parents/targets are refused. There is no unrestricted Rust filesystem write implementation.

Immediately before overwrite, Go opens the target without truncation, checks full identity/content/hash/count, then rechecks the named target identity and link count. It writes that pinned descriptor, truncates to the reviewed length, syncs and closes. It never redirects a write to a replacement path object. Windows write handles deny concurrent write/delete sharing while admitted. Permission/path and base checks detect preexisting conflicts.

This is **not a general atomic compare-and-swap against unrelated external writers**. Other Unix applications can edit or rename after the final check; writes remain attached to the checked open object. Parent/target handles and grant locks serialize this broker and protect identity, not all applications. There is no atomic replacement, rollback, directory-fsync crash guarantee or durable file history. A failure after a possible first effect reports unknown rather than claiming unchanged files. These limits must be qualified for each supported filesystem/platform and communicated before enabling the UI.

Delete, same-root move, recursive/root/cross-root mutation, command execution, persistent grant restoration and cloud processing are outside this slice. A future destructive variant needs separate destructive consent and exact review. S2c.5 retains command/provider qualification; S3–S6 retain packaged frontend, durable profiles, installers, signing and downloads.

## Protocol and canonical v2

Native startup requires the ordered features `session-authority-v1`, `native-action-allowlist-v1`, `read-grants-v1`, `guarded-file-mutations-v1`. A three-feature daemon is incompatible. The native-mode exhaustive allowlist adds preparation, dispatch, status and cancellation only; legacy filesystem, shell, memory/cloud and arbitrary network actions remain denied. Every action stays behind unconditional launch authentication and closed JSON decoding.

Canonical v1 creation fixtures remain unchanged for compatibility/integrity regressions. Prepared mutations always use v2: prefix `LATTICE_NATIVE_PROPOSAL\0\x02`; strings have a big-endian 32-bit UTF-8 byte length. In order, encode proposal/principal/workspace/generation strings; policy/grant revisions as u64 big-endian; grant/root strings; read-only byte; 300000 as u32 big-endian; operation tag (1 create file, 2 create directory, 3 write text); relative path; content for file/write; parent volume/file strings. Creation ends with `must_be_absent`. Overwrite ends with `matches_base`, base volume/file and SHA3-256 strings, then base byte count as u64 big-endian. Complete base content must match its hash/count before canonicalization; the digest binds it through that hash.

The independent Python-generated `testdata/native-prepared-digests.json` fixtures cover both OS identity widths, all supported operations, UTF-8/control content and empty overwrite content. Rust and Go independently validate them. IDs/digests are nonsecret integrity references, never bearer approvals; the native review lease remains nonserializable.

## Validation

Use `.github/workflows/native-host.yml`, `windows-command-harness.yml` and `build-tauri.yml` for Windows/Linux core/real-daemon, Go/client, bundled renderer/CSP and full shell permission checks. Preserve lifecycle, retired-credential, parent-loss and descendant-cleanup regressions. CodeQL must pass without alert suppression or check bypass.

New regressions cover separate consent/revision invalidation, successful create/directory/overwrite, external-content and same-content replacement conflicts, hard links, symlink/junction parents, nested read-only roots, replaced parents, root/missing-parent refusal, complete before/after display, stale/malformed/authenticated endpoint admission, concurrent one-use dispatch, capacity/replay retention, revocation/cancellation ownership and observed partial unknowns. The real-daemon lost-response proxy drops a dispatch response after Go admission and abandons the initiating Rust caller, then requires one actual write and status reconciliation with exactly one dispatch.

Full native UI and clean-machine installer qualification remain outstanding. Passing headless, MockRuntime or Chromium tests must not enable file-changing UI or activate downloads.
