Lattice OS CLI release candidate for development evaluation.

Includes native command-line executables for Linux x64/ARM64, macOS Intel/Apple silicon, and Windows x64. Each artifact has native-runner CLI smoke evidence, a CycloneDX dependency report, a SHA-256 checksum, and GitHub build provenance.

Before executing an installer or binary, verify its checksum and provenance against the source commit shown in release-manifest.json. Installers require an explicit version and full source commit. The bundled Python runtime does not need a separate Python installation.

This candidate is not a stable production appliance release. Platform code signing/notarization, live deployment and rollback validation, CLI organization-auth wiring, and commercial-license hardening must be completed before stable promotion. No bootable ISO or desktop installer is included.

Operator: keep this draft until attestations, complete matrix evidence, and installer tests have been reviewed. Publish as a prerelease only; update the reviewed downloads catalog in a separate PR after verification. See docs/releases/cli-release-readiness.md.
