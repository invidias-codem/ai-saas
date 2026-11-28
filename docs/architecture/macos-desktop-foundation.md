# macOS native desktop foundation — M0/M1

Status: evaluation-only implementation. The presence of an app bundle or a runtime executable is **not** sandbox qualification.

## Hardware and backend policy

| Host | Candidate backend | Enforced state |
| --- | --- | --- |
| Apple Silicon / macOS 26+ | Apple `container` when found | execution disabled pending full adapter qualification |
| Apple Silicon / macOS 13–25 | Lima when found | execution disabled pending full adapter qualification |
| Intel x86_64 / macOS 13+ | Lima when found | execution disabled pending full adapter qualification |
| Unsupported architecture, OS or unverified hypervisor | none | fail closed |

Apple's `container` requires Apple Silicon and is supported on macOS 26. Using an OCI image built for amd64 through Rosetta on an Apple Silicon Mac is not the same as supporting an Intel host. Intel needs a separately qualified Linux VM backend, not an Apple `container` port.

## What this slice implements

- `scripts/desktop/sidecar-targets.mjs` is the one authority for Go sidecar target triples: macOS ARM64, macOS Intel x64, Windows x64 and Linux x64.
- `scripts/desktop/build-sidecar.mjs` compiles the selected Go sidecar with explicit GOOS and GOARCH; the old shell script now delegates to it.
- `scripts/desktop/macos-runtime-probe.mjs` returns non-sensitive, read-only diagnostic signals and only **candidates**. `executionEnabled` is always `false`.
- `.github/workflows/macos-desktop.yml` builds and checks an app and its sidecar on both hosted Mac architectures. Artifacts are unsigned test ZIPs with checksums and source identity, not public downloads.
- Existing Rust authority, scoped grants, exact-action review, credential broker, sidecar protocol and Windows/Linux packaging stay unchanged.

## Contract boundary to retain in M2/M3

UCOL `ExecutionRuntime` remains provider-neutral. A future backend is selected by registered capabilities and policy, not by agent preference or a webview flag. The native Rust owner must retain all host authorization and approvals; the Go harness cannot treat a CLI executable being present as permission to execute a command. Never choose raw host execution after a VM or provider failure.

Implement an explicit native (Rust-owned) VM lifecycle, OCI workload adapter, per-task quotas, read-only image store and writable disposable overlay, scoped workdir mounts, network egress policy, cancellation/descendant termination, bounded stdout, audited receipts and version negotiation. Secrets never enter sandbox env by default. Prevent symlink escapes and no general host folder, home, Docker socket or SSH agent mounting. Add policy-tested suspend/destroy and crash-reconciliation behavior. Advertise snapshot/persistence features only when implemented.

## CI and qualification

The hosted Mac runners can compile/package and validate architecture, but do not qualify nested virtualization, a usable Linux VM, the real WebView/native dialogs or signing/notarization. Run physical Intel Mac and Apple Silicon macOS 26 tests before enabling any commands or calling installers stable.

Required tests before M2/M3 activation: negative command-path tests; no unsafe fallback; denied mount/path traversal; resource exhaustion and timeout handling; host network denial; parent crash; concurrent sessions; kill-and-reap; two-architecture OCI build/preview parity; reproducible cleanup; signed/notarized clean install and uninstall; upgrade and migration. Record exact Mac hardware, macOS versions, timings and artifacts.

## Agent handoff sequence

1. Review this M0 PR and CI on both platforms; fix any platform-specific compile/package failures without loosening safety checks.
2. Add M2 Apple `container` adapter behind explicit feature flag and self-test on a physical Apple Silicon macOS 26 device. Do not automatically install `container` or start its service without the user's consent.
3. Add M3 Lima/Colima-compatible Intel runtime with strict equivalence of OCI manifests, mounts, network restrictions and lifetime behavior. Test on a physical Intel Mac and document the supported macOS range.
4. Wire the qualified adapters through Rust/Go native authority to workspace Code Builder, local previews, artifact export and CI/deployment. Strictly separate inference (Metal/remote API) from sandbox compute.
5. Finish actual macOS installation UX, signed + notarized artifacts, launch/upgrade/uninstall tests, documentation, telemetry/redaction, and release gate. Keep product downloads disabled until evidence is reviewed.

### Competitor-level acceptance goals (not claims of completion)

First-run setup detects the host and explains available features, doesn't demand Docker/CLI knowledge, lets a user select and approve a workspace, creates and tears down isolated builds, displays logs and preview URLs, and safely exports artifacts. App works on both Apple Silicon and Intel without background daemons or surprise privileges. Offline-only mode must never silently use a cloud inference or execution provider.

References: https://github.com/apple/container ; https://github.com/apple/containerization ; https://github.com/lima-vm/lima ; https://github.com/abiosoft/colima
