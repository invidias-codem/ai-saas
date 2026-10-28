# Desktop installation slices

Current slice: [S2c.1 — Native session authority](tasks/native-session-authority.md). Native mode now negotiates and binds local authority before readiness; platform checks and PR review are pending. The next slice is S2c.2: selected folder grants and typed bounded reads. The [full S2c plan](https://github.com/invidias-codem/ai-saas/blob/plan/native-workspace-authority/docs/operations/native-workspace-authority-plan.md) defines the remaining approval and operation work.

Dependencies: [S1 — Native capability boundaries](tasks/native-capability-boundaries.md) reached main in #451. [S2a — Authenticated startup](tasks/native-desktop-host-startup.md) merged in #452 into the former S1 feature branch after S1 had already merged, leaving S2a outside main. #453 now carries both S2a and [S2b — Native host lifecycle](tasks/native-host-lifecycle.md) against current main. Fresh required checks, CodeQL and human review gate its integration; no automatic merge is enabled.

1. **S1: File and outbound HTTP boundaries.** Descriptor-bound grants, identity checks, legacy bypass denial, constrained HTTP, separate upstream credentials, and real regressions.
2. **S2: Native desktop host.** S2a: Rust-owned credentials, authenticated startup and heartbeat. S2b: graceful shutdown, explicit restart and active-command cleanup. S2c: typed IPC with trusted identity/approval injection for approved operations.
3. **S3: Production desktop frontend.** Packaged assets, native-only local operations, and no development server requirement.
4. **S4: Persistent local profiles.** OS data directories, scoped memory/checkpoints, journal, migrations, backup/restore and interrupted-task reconciliation.
5. **S5: Windows/Linux installer candidates.** Windows NSIS standard/offline variants and Linux AppImage/deb; native prerequisites and clean-machine lifecycle tests.
6. **S6: Trusted distribution.** Signing, SBOM/provenance, final-byte verification, qualified releases and product-specific download catalog activation.

Each slice goes through PR review. S1, S2a and S2b do not enable downloads or qualify an installer. Copilot/Teams enrollment, offline inference and OS-level child-process egress isolation retain their own qualification gates. See [the native host contract](docs/operations/native-desktop-host.md) for current guarantees and limits.
