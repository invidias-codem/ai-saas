# Native capability security slice

This slice follows merged #448 and closes the four reproduced file/network defects. It is not a desktop release or an offline-agent qualification.

## File authority

`sync_root_grants` installs an immutable snapshot of at most 128 absolute directories with nonblank owner identities. Every directory is opened with `os.OpenRoot` at installation; updates fail atomically if a directory is unavailable. The caller must be the trusted native host. An agent must never receive authority to install its own grants.

File reads, listings, metadata, creation, writes, removal, renaming, document discovery, extraction and ingestion use descriptor-relative operations. Identity must match the grant's user and workspace. An explicitly workspace-independent user grant still applies across that user's workspaces. The most specific matching grant controls access; an enclosing writable grant cannot override a nested read-only grant. Equal-path duplicates retain first-match behavior.

An admitted synchronous filesystem operation holds a read lock on its grant snapshot. Revocation waits for it and denies subsequent operations. Pinned handles remain tied to the approved directory across Unix renames; Windows prevents renaming an opened root. Registry handles close on daemon exit. Ingestion rechecks authority for each read and does not hold a grant lock during network calls.

Reads/writes accept regular files, with a 256 KiB local tool limit. Text extraction retains its 100 KiB bound. Unix nonblocking opens prevent FIFOs from hanging the grant lock. Directory listings/scans have a 10,000-entry bound. These limits return explicit failures. They are not sustained-load or filesystem crash-durability qualification.

Creating a file does not overwrite an existing one. Mutations cannot target a grant root itself. Moves require both paths to share one writable pinned grant; cross-root/EXDEV copy/delete is unsupported. Legacy `read_file`, `write_file` and `patch_file` RPCs now return `FILE_ACCESS_DENIED`, like the already-denied legacy command RPC. Clients must use identity- and grant-checked capabilities. The old `IOHarness` convenience methods do not acquire grants implicitly.

`os.Root` is not a child-process sandbox and does not prevent traversal of privileged bind mounts or hard links already inside an approved directory. Arbitrary approved commands still require separate OS isolation and enterprise policy.

## Outbound HTTP

Cloud HTTP is restricted to the product origin `https://gen1e.xyz`; workspace route identifiers cannot change paths or origins. This is a conservative first contract, not company-origin enrollment. Custom company endpoints and HTTP development servers are refused until a trusted enrollment/launcher contract exists.

GitHub HTTP requires HTTPS on the standard port, approved hosts, read-only methods, and an allowed repository path (plus authenticated-user inventory endpoints). Userinfo, fragments, escaped traversal/separators, unknown hosts and out-of-scope repositories are refused. HTTP clients disable redirects and environment proxy selection, resolve the allowed hostname, reject nonpublic/mixed DNS answers, and dial only the validated addresses. TLS still validates the original hostname. Clients have finite timeouts and response reads are bounded to 2 MiB.

The local launch token is never automatically supplied as a GitHub/cloud credential. Network RPCs use separate explicit upstream credentials; accidentally reusing the launch credential is rejected. Cloud embedding calls no longer default to an unauthenticated localhost service. Cloud credential enrollment/storage and user-facing connected-mode UX remain S2/S4 work.

Git clone uses a validated `owner/repository` URL without credentials. Host-scoped authorization is supplied through transient Git config environment values, not argv or `.git/config`; inherited Git configuration, credential helpers and hooks are disabled. The clone child receives a minimal environment excluding the launch token. Same-user process inspection can still expose environment material: a reviewed OS credential provider and process isolation remain future hardening. Git subprocess network behavior is not covered by the Go HTTP transport's DNS pinning guarantee.

Telemetry remains local when no approved cloud endpoint is configured. Its buffer is bounded and best-effort; it is not the future durable memory journal or an offline synchronization outbox.

## Evidence and remaining gates

The daemon RPC regressions reproduce the original symlink/junction read/write escapes, wrong-identity read, and off-host credential-bearing GitHub request. Additional tests cover legacy file denial, nested read-only grants, revocation, Unix directory replacement, read/create behavior, DNS pinning, redirects, response bounds, endpoint admission, and clone argument hygiene. Windows junction tests must run even when symlink privileges are absent.

Windows/Linux CI runs all relevant native package tests, including auth regressions. Linux also runs the race detector. Real Node-to-Go lifecycle tests continue to run against a freshly built daemon.

Code scanning remains an independent release gate. Do not bulk-dismiss alerts or weaken queries to pass this slice. A remaining `os.OpenRoot` taint result needs its exact source/authority path reviewed; using a descriptor somewhere else is not sufficient evidence.

Next: Rust-owned authenticated sidecar lifecycle and scoped IPC, packaged frontend, protected per-profile memory and recovery, offline/model/egress policy, then final signed installer qualification and download activation. Memory RPC tenant/account isolation, background job shutdown ownership, OS credential custody, native OAuth/CSP, and arbitrary-command isolation are not established by this slice.
