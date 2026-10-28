# Desktop installation slices

Current slice: [S2c.3 — Native exact operation review](tasks/native-operation-review.md). A separate bundled native review surface binds immutable creation proposals to the current session, grant revisions, payload digest and one-use decision. File execution and writable grants remain disabled. S2c.4 adds guarded file mutation admission and target preconditions. The [full S2c plan](https://github.com/invidias-codem/ai-saas/blob/plan/native-workspace-authority/docs/operations/native-workspace-authority-plan.md) defines the remaining work.

Dependencies: [S1 — Native capability boundaries](tasks/native-capability-boundaries.md) reached main in #451. #453 integrated [S2a — Authenticated startup](tasks/native-desktop-host-startup.md) and [S2b — Native host lifecycle](tasks/native-host-lifecycle.md) into main as `3034d84483bbcc2d5cfa95a48e1ee644e4aee588`. [S2c.1](tasks/native-session-authority.md) remains in #454; [S2c.2](tasks/native-workspace-reads.md) remains in #455. S2c.3 is stacked on #455's verified source. Reconcile onto main after the human-reviewed parent merges; no automatic merge is enabled.

1. **S1: File and outbound HTTP boundaries.** Descriptor-bound grants, identity checks, legacy bypass denial, constrained HTTP, separate upstream credentials, and real regressions.
2. **S2: Native desktop host.** S2a: Rust-owned credentials, authenticated startup and heartbeat. S2b: graceful shutdown, explicit restart and active-command cleanup. S2c: typed IPC with trusted identity/approval injection for approved operations.
3. **S3: Production desktop frontend.** Packaged assets, native-only local operations, and no development server requirement.
4. **S4: Persistent local profiles.** OS data directories, scoped memory/checkpoints, journal, migrations, backup/restore and interrupted-task reconciliation.
5. **S5: Windows/Linux installer candidates.** Windows NSIS standard/offline variants and Linux AppImage/deb; native prerequisites and clean-machine lifecycle tests.
6. **S6: Trusted distribution.** Signing, SBOM/provenance, final-byte verification, qualified releases and product-specific download catalog activation.

Each slice goes through PR review. S1, S2a and S2b do not enable downloads or qualify an installer. Copilot/Teams enrollment, offline inference and OS-level child-process egress isolation retain their own qualification gates. See [the native host contract](docs/operations/native-desktop-host.md) for current guarantees and limits.
