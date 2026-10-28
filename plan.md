# Desktop installation slices

Current slice: [S2a — Authenticated native startup](tasks/native-desktop-host-startup.md).

Dependency: [S1 — Native capability boundaries](tasks/native-capability-boundaries.md) is implemented in draft PR #451 and awaits review/merge. S2a is stacked on that branch.

1. **S1: File and outbound HTTP boundaries.** Descriptor-bound grants, identity checks, legacy bypass denial, constrained HTTP, separate upstream credentials, and real regressions.
2. **S2: Native desktop host.** S2a: Rust-owned credentials, authenticated startup and heartbeat. S2b: graceful shutdown, explicit restart and active-command cleanup. S2c: typed IPC with trusted identity/approval injection for approved operations.
3. **S3: Production desktop frontend.** Packaged assets, native-only local operations, and no development server requirement.
4. **S4: Persistent local profiles.** OS data directories, scoped memory/checkpoints, journal, migrations, backup/restore and interrupted-task reconciliation.
5. **S5: Windows/Linux installer candidates.** Windows NSIS standard/offline variants and Linux AppImage/deb; native prerequisites and clean-machine lifecycle tests.
6. **S6: Trusted distribution.** Signing, SBOM/provenance, final-byte verification, qualified releases and product-specific download catalog activation.

Each slice goes through PR review. S1 and S2a do not enable downloads or qualify an installer. Copilot/Teams enrollment, offline inference and OS-level child-process egress isolation retain their own qualification gates. See [the native host contract](docs/operations/native-desktop-host.md) for current guarantees and limits.
