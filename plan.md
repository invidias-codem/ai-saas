# Desktop installation slices

Current slice: [S2c.4 — Guarded native file mutations](tasks/native-file-mutations.md). The native Rust/Go broker prepares trusted parent/base preconditions, consumes exact reviews once and owns file mutation outcomes. Read-only folder selection remains the default. Tauri write consent/dispatch stays disabled pending S2c.6 native UI qualification. Next is S2c.5 command/provider admission. See the [mutation contract](docs/operations/native-file-mutations.md) and [full S2c plan](https://github.com/invidias-codem/ai-saas/blob/plan/native-workspace-authority/docs/operations/native-workspace-authority-plan.md).

Dependencies: S1 #451 and S2a/S2b #453 are on main; S2c.1 #454 is integrated as `9e7398c3138130ddc60a800a17a21137a326007c`. S2c.2 #455 and S2c.3 #456 remain human-review dependencies. S2c.4 #457 builds on #456 and reconciles the identical merged #454 source onto main. Integrate parents through review and rerun checks; no automatic merge is enabled.

1. **S1: File and outbound HTTP boundaries.** Descriptor-bound grants, identity checks, legacy bypass denial, constrained HTTP, separate upstream credentials, and real regressions.
2. **S2: Native desktop host.** S2a: Rust-owned credentials, authenticated startup and heartbeat. S2b: graceful shutdown, explicit restart and active-command cleanup. S2c: typed IPC with trusted identity/approval injection for approved operations.
3. **S3: Production desktop frontend.** Packaged assets, native-only local operations, and no development server requirement.
4. **S4: Persistent local profiles.** OS data directories, scoped memory/checkpoints, journal, migrations, backup/restore and interrupted-task reconciliation.
5. **S5: Windows/Linux installer candidates.** Windows NSIS standard/offline variants and Linux AppImage/deb; native prerequisites and clean-machine lifecycle tests.
6. **S6: Trusted distribution.** Signing, SBOM/provenance, final-byte verification, qualified releases and product-specific download catalog activation.

Each slice goes through PR review. S1, S2a and S2b do not enable downloads or qualify an installer. Copilot/Teams enrollment, offline inference and OS-level child-process egress isolation retain their own qualification gates. See [the native host contract](docs/operations/native-desktop-host.md) for current guarantees and limits.
