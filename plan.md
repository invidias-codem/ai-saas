# Desktop installation slices

Next slice: [S2c — Native workspace authority](tasks/native-workspace-authority.md). The [implementation plan](docs/operations/native-workspace-authority-plan.md) defines the ordered sub-slices, typed IPC boundaries and Windows/Linux acceptance matrix. Planning is complete; S2c runtime implementation has not started.

Dependencies: [S1 — Native capability boundaries](tasks/native-capability-boundaries.md) merged into main in #451. [S2a — Authenticated startup](tasks/native-desktop-host-startup.md) merged in #452 into the former S1 branch after S1 had already merged; S2a is still absent from main. [S2b — Native host lifecycle](tasks/native-host-lifecycle.md) is implemented in draft PR #453 with passing native implementation checks. Reconcile S2a/S2b onto main through human review and obtain CodeQL before integration; a merge into an old feature branch does not complete that gate.

1. **S1: File and outbound HTTP boundaries.** Descriptor-bound grants, identity checks, legacy bypass denial, constrained HTTP, separate upstream credentials, and real regressions.
2. **S2: Native desktop host.** S2a: Rust-owned credentials, authenticated startup and heartbeat. S2b: graceful shutdown, explicit restart and active-command cleanup. S2c: versioned native authority, selected folder grants, typed reads, isolated native review, single-use file approvals and a command broker that requires a qualified isolation provider.
3. **S3: Production desktop frontend.** Packaged assets, native-only local operations, and no development server requirement.
4. **S4: Persistent local profiles.** OS data directories, scoped memory/checkpoints, journal, migrations, backup/restore and interrupted-task reconciliation.
5. **S5: Windows/Linux installer candidates.** Windows NSIS standard/offline variants and Linux AppImage/deb; native prerequisites and clean-machine lifecycle tests.
6. **S6: Trusted distribution.** Signing, SBOM/provenance, final-byte verification, qualified releases and product-specific download catalog activation.

Each slice goes through PR review. S1 and S2 do not enable downloads or qualify an installer. Copilot/Teams enrollment, offline inference and OS-level child-process filesystem/network isolation retain their own qualification gates. S2c starts with session-local workspace authority; durable identity, memory and recovery remain S4. See [the native host contract](docs/operations/native-desktop-host.md) for current guarantees and limits.
