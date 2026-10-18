# Lattice OS CLI release readiness

The downloads experience lives at `/downloads` in the existing Lattice OS app. It distributes the Python appliance-management CLI in `scripts/lattice-cli`, not the internal Node prompt transport, desktop Electron application, or a bootable operating-system image.

## Current release decision

Candidate version: **0.3.1-rc.1**. **Do not label stable or recommend production deployment yet.** The initial downloads catalog intentionally contains no active release. No binary links appear until a reviewed catalog entry exists. The old published GitHub v0.1.0 release has no CLI binaries; `/releases/latest` is not a CLI discovery mechanism.

## Implemented controls

- Fixed the source launcher to propagate failing command exit codes.
- Added `doctor --offline --json`: exercises real ed25519 signing/verification in the bundled crypto extension without accessing Docker, user state, or the network. `doctor` also checks local Docker/Compose.
- Native-runner builds for Linux x64/ARM64, macOS Apple silicon/Intel, Windows x64. Python 3.12 is bundled. Build refuses mismatched target labels. Linux baseline: Ubuntu 22.04 / glibc 2.35; macOS ARM build baseline 14, Intel 15; Windows deployment requires Docker Desktop Linux containers. Windows ARM and Alpine/musl are not supported.
- Exact dependency versions plus a SHA-256 locked cross-platform build file. Actions are pinned to reviewed commit SHAs; build jobs have read-only repository permissions.
- Source and packaged smoke tests, dependency vulnerability gate, per-target CycloneDX SBOMs, SHA256SUMS, and GitHub artifact attestations. Supplemental Python/TypeScript CodeQL scans enforce a high/critical-severity SARIF gate and retain reports as workflow artifacts; they preserve the repository's existing CodeQL default setup instead of attempting a conflicting advanced-analysis upload. Only the main-branch manual workflow can stage a release; automatic pushes cannot publish one.
- Operator-controlled **draft prerelease** only. The workflow never publishes stable or updates the downloads catalog automatically.
- Installers require an explicit candidate/stable tag and 40-character source commit. Verify exact checksums and GitHub provenance (repository + workflow + main source ref + source digest) before executing a binary. Install per user without sudo. No mutable-main source fallback and no automatic remote script execution.
- Static, reviewed catalog with strict validation; artifact URLs derive from a fixed repository and asset-name allowlist. No upload surface, user-supplied URL, token in the browser, open redirect, or runtime GitHub API dependency. Invalid catalog data produces an unavailable state. Existing site TLS/security headers and hosting protections apply.

## Release sequence

1. Merge the release foundation PR after CI/security review. The PR matrix must build and execute all five native binaries; local Linux tests cannot certify macOS or Windows.
2. Protect the `cli-release` GitHub environment with required reviewers and main-branch-only deployment rules. Enable immutable releases and protect `cli-v*` tags. These repository settings must be verified by the release owner; YAML alone cannot prove they are configured.
3. Run **Build lattice-cli** on `main` with `release_tag=cli-v0.3.1-rc.1`. All build, test, audit, aggregation, and attestation steps must pass. This creates a draft prerelease with the exact build inputs and evidence.
4. On clean machines, review the release manifest and attestations; test the actual installers, installation with/without an existing binary, missing prerequisites, PATH setup, failed verification, upgrade, and uninstall. Never disable Gatekeeper/SmartScreen to qualify a stable artifact.
5. Publish only as a **prerelease** after operator review. Never publish an incomplete draft. Run:

   ```sh
   python scripts/lattice-cli/prepare_catalog.py cli-v0.3.1-rc.1 --output lib/releases/cli-catalog.json
   ```

   The tool verifies published prerelease metadata, the exact tag commit, all artifact digests/sizes, attestations, and clean dependency reports. It proposes a catalog change without executing downloaded code. Commit it through a separate PR. The candidate will then appear on the downloads page with its evaluation notice.
6. Stable promotion requires every blocker below to be resolved. A separate release tag/version and reviewed catalog entry are required. Catalog validation rejects stable entries without platform-signing, live deployment, and rollback evidence. Do not flip booleans as a substitute for executing and recording those checks.

## Open stable-release blockers from the audit

| Boundary | Finding / required evidence |
| --- | --- |
| Platform trust | Developer ID signing **and notarization** for both macOS artifacts; trusted Authenticode signing for Windows. Candidate artifacts explicitly report `nativeSigned=false`. GitHub provenance does not replace OS trust. No signing identity is configured by this change. |
| Appliance end-to-end | Fresh install → authorized registry pull → license activation → deploy → restart → health → upgrade → rollback → backup/restore on a disposable instance; repeat for each claimed deployment platform. No live customer data or production credentials in release tests. |
| Commercial licenses | Legacy ENT keys are accepted by format alone, `auth generate` can mint them, V3 activation does not reject an already-expired signed payload, and active license state is not consistently reverified. Remove unsigned enterprise activation, validate signature/tier/expiry on every entitlement read, and keep signing private keys out of client artifacts. |
| Organization commands | Python org.py imports missing `require_env`/`parseCliEnv`, catches the failures, then uses unauthenticated localhost defaults. Wire an explicit authenticated CLI API contract; verify cross-tenant denial before advertising remote organization control. |
| Backups | The volume helper writes `volume.tar.gz` while backup.py expects per-volume names; multiple volumes can overwrite each other. Correct naming, check volume snapshot consistency, protect secret-bearing backup files, and prove restoration before claiming recovery. |
| Credential handling | Docker login uses password-stdin, but `--token` options can place tokens in shell history/process arguments. Add stdin/credential-store paths for unattended use; ensure diagnostics and reports never reveal tokens. |
| Deployment artifacts | Appliance image digest/version and Compose configuration must be pinned and exercised. CLI binary smoke does not establish application stability or Docker appliance compatibility. |
| Full site validation | Production Next build, repository CodeQL/security gates, accessibility/responsive review, and public-route isolation checks must pass. Existing unrelated CI failures must be recorded separately. |

## Rollback and revocation

To revoke a CLI build, remove the catalog entry via a reviewed hotfix so the downloads page immediately stops offering it, mark the GitHub release withdrawn, and publish a security advisory when warranted. Never replace bytes under an existing version. Keep a previously verified release available for explicit reinstallation; installers never choose an unpinned `latest`. For immutable releases, preserve the original evidence and withdraw visibility through the catalog rather than attempting to edit assets.

## Source verification

Primary references used for the release controls:

- GitHub artifact attestations: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- GitHub CLI verification flags: https://cli.github.com/manual/gh_attestation_verify
- GitHub release integrity: https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity
- Native platform bundling constraints: https://pyinstaller.org/en/stable/operating-mode.html
