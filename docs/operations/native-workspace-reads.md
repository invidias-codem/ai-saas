# Native-confirmed workspace reads

S2c.2 builds on #454's session authority and the S2a/S2b host integrated by #453. It provides a Rust-owned picker adapter, complete read-only grant snapshots, revocation and typed file previews. It does not qualify the production workspace UI, a company identity, durable project memory, an installer or download publication.

## Selection and confirmation

The main local webview can request `native_select_folder` with an empty input object. It cannot supply a path, principal, workspace, grant list or approval flag. Rust invokes the nonblocking dialog plugin and requires a second native confirmation showing the actual canonical folder path and read access. The path contains no control or bidirectional override characters. Cancellation or denial sends no grant update.

Rust opens the selected directory before confirmation and retains its handle until Go acknowledges installation. Unix uses directory-only, no-follow, nonblocking opening. Windows uses directory backup semantics and the handle's volume/full 128-bit file ID through `FileIdInfo`; the legacy 64-bit index is [not guaranteed unique on ReFS](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information). Filesystems that cannot supply the required identity are refused. Rust and Go compare the same OS directory identity before publishing a grant. Replacement between confirmation and installation fails closed. These IDs describe an object; they are not credentials or a guarantee against privileged OS administrators.

Rust generates an independent 128-bit `local-grant-...` ID. The frontend receives that ID, the selection-time display path and `read_only: true`. The path is display text and is never accepted back as authority. Keep one picker/confirmation active and at most 32 grants per native session. The native Tauri dialog dependency is pinned; desktop builds require Rust 1.90 or later. Its transitive filesystem plugin receives no frontend command permission.

## Atomic grant snapshots

The private `native_update_grants` request contains `next_revision` and the complete list of `{grant_id, path, directory_identity}` records. The authenticated envelope carries the bound local identity, generation and current policy/grant revisions. No user/workspace claim or write/destructive flag exists in a grant record. Every grant is workspace-specific and read-only.

Go checks exact current authority and the next revision, validates every record, pins new directories and retains existing grant handles. It commits the entire snapshot or none of it. A rejected authorized update blocks the workspace and releases its grants. Rust publishes its new revision/list only after an exact acknowledgement of protocol, authority and all grant IDs. Rejection, timeout, changed acknowledgement or cancellation during an uncertain update blocks admission. There is no automatic control retry or fallback to an old permission set; a clean restart is required.

Grant writers close new read admission and wait for admitted reads. Revocation sends a complete snapshot without the selected handle and acknowledges only after the registry boundary has drained. It cannot recall content already returned, or remove permission conferred by a separately confirmed overlapping grant. Failed or uncertain revocation blocks the whole workspace.

Permission transitions remain owned when an IPC caller disappears. Restart closes the old session, cancels pending picker results and clears all grants. A permission change during a pending confirmation makes that selection stale. No remembered path silently restores access after restart.

## Typed reads and limits

The only data inputs are `{grant_id, relative_path}`. List and stat use `.` for the granted root. Relative paths use forward slashes. Rust and Go share portable admission fixtures; Go also resolves through the exact grant's pinned `os.Root` under the registry lock. Absolute/drive/UNC/device/stream/URI forms, traversal, ambiguous components, control characters and Windows reserved names are rejected on both platforms. A different grant cannot authorize a failed handle lookup. `os.Root` rejects outward symlink/junction traversal; retaining its descriptor prevents a renamed/replaced directory from silently rebinding the grant.

| Operation | Result | Bound |
| --- | --- | --- |
| `native_read_text` | UTF-8 content and byte count | 256 KiB; no NUL bytes; regular files only |
| `native_list` | Sorted names and file kinds | 10,000 entries and 1 MiB encoded data; explicit error at either bound |
| `native_stat` | File kind and size | Descriptor-rooted lookup; no file content |

Special files cannot block a regular-file read or directory listing through FIFO opening. Files can still change while another application edits them; a text preview is not a transactional snapshot. Native RPC responses retain the 2 MiB transport cap and 1.5-second request deadline. Filesystem errors become static codes/messages rather than raw OS diagnostics or absolute paths. A stalled filesystem can still prevent timely revocation; its unknown acknowledgement blocks the workspace and S2b refuses replacement if process cleanup cannot be confirmed.

Names, display paths and content are untrusted text. The local TypeScript adapter validates closed inputs/results, byte counts and bounds, invokes only fixed Tauri commands and never uses a network fallback or retries a control mutation. It does not log payloads or render HTML. Selection never performs discovery, ingestion, embedding, memory writes or cloud requests. Legacy file/command routes, raw grant installation, filesystem/dialog plugin commands and generic RPC remain denied even with a valid native launch credential.

## Verification and qualification

Go tests cover schema/identity/revision denial, atomic invalid snapshots, portable paths, foreign/revoked grants, entry/text limits, root replacement and Unix symlink/Windows junction escapes. Rust tests use a freshly built real Go daemon to verify cross-language directory identity, selection, read/list/stat, revocation and replacement during confirmation. Additional fixtures cover uncertain control acknowledgements, no retry, queued revocation, cancellation, concurrent pickers, abandoned callers and restart isolation. Tauri MockRuntime exercises the production ACL resolver and closed command arguments. Windows/Linux CI also retains S2b's real cleanup tests and the existing CSP browser tests.

The product dashboard is not wired to these file endpoints by this slice. Native picker interaction and actual WebKit/WebView2 enforcement still need native UI smoke qualification before enabling a data-bearing product UI. MockRuntime, a headless daemon and Chromium response-header CSP checks do not establish that qualification. S2c.3 adds the isolated immutable review surface; S2c.4 adds approved file mutations; S2c.5 keeps commands denied until a qualified execution provider exists. S3 owns the full packaged frontend, S4 durable profiles/recovery, S5 clean-machine installers and S6 signed distribution.
