# Desktop installation slices

Current slice: [S1 — Native capability boundaries](tasks/native-capability-boundaries.md).

1. **S1: File and outbound HTTP boundaries.** Descriptor-bound grants, identity checks, legacy bypass denial, constrained HTTP, separate upstream credentials, and real regressions.
2. **S2: Native desktop host.** Rust-owned launch credentials and sidecar handles; bounded, typed IPC; trusted identity/approval injection; restart and shutdown.
3. **S3: Production desktop frontend.** Packaged assets, native-only local operations, and no development server requirement.
4. **S4: Persistent local profiles.** OS data directories, scoped memory/checkpoints, journal, migrations, backup/restore and interrupted-task reconciliation.
5. **S5: Windows/Linux installer candidates.** Windows NSIS standard/offline variants and Linux AppImage/deb; native prerequisites and clean-machine lifecycle tests.
6. **S6: Trusted distribution.** Signing, SBOM/provenance, final-byte verification, qualified releases and product-specific download catalog activation.

Each slice goes through PR review. S1 does not enable downloads or qualify an installer. Copilot/Teams enrollment, offline inference and OS-level child-process egress isolation retain their own qualification gates.
