# Desktop evaluation packages and download paths

This slice provides a bundled local workspace and per-OS package paths. It does not declare S2c.6, S4, S5 or S6 complete. Native consent, exact review and command sandbox denial remain enforced by Rust and Go.

## Download surfaces

| Path | Package | Current qualification |
| --- | --- | --- |
| `/downloads/windows` | `lattice-desktop-windows-x64-setup.exe` | Evaluation installer; Windows 11 x64 |
| `/downloads/linux` | `lattice-desktop-linux-x64.AppImage`, `lattice-desktop-linux-x64.deb` | Evaluation packages; Ubuntu 22.04+ x64 |
| `/downloads/macos` | None | Native filesystem/permission support and installer qualification pending |

Localized paths use the existing supported locale prefixes. Only these exact pages are public; no downloads API or wildcard exemption is introduced. The Docker appliance CLI catalog and desktop catalog remain separate.

`Desktop evaluation packages` builds on a PR or reviewed main and uploads platform artifacts to its workflow run. Download the artifact for the exact source commit, extract it, and compare `SHA256SUMS`. Repository access and GitHub sign-in are required. The included `desktop-build-manifest.json` records the actual source and hashes and explicitly marks native UI and clean-machine installation as pending. An uploaded artifact is not public-release approval or installation qualification.

The preview uses a distinct app identifier (`xyz.gen1e.lattice-os.preview`) and product name. It does not enroll the device into a company or upload local files. Windows installs for the current user; WebView2 bootstrapping can require network access. Linux packages bundle the local service but still require their platform WebView/system libraries.

## Build and run

Prerequisites: Node 22+, the pinned pnpm version, Go matching `go-harness/go.mod`, Rust matching the locked crates, and the Tauri platform dependencies. Windows requires Visual Studio C++ Build Tools and WebView2. Linux requires WebKitGTK 4.1, GTK, and the packaging dependencies listed in the workflow.

```sh
pnpm install --frozen-lockfile
pnpm desktop:check
pnpm desktop:sidecar
pnpm exec tauri build --no-bundle --config src-tauri/tauri.preview.conf.json
```

Run `src-tauri/target/release/app` on Linux or `src-tauri/target/release/app.exe` on Windows. Run from a visible desktop session, or attach a viewer to Xvfb. The Tauri CLI runs the desktop frontend hook, embeds `desktop/dist`, and handles the sidecar; the SaaS `pnpm build` and `../out` are not part of this desktop path. No development server or cloud credentials are needed.

For installers:

```sh
# Windows, on Windows x64
pnpm desktop:sidecar
pnpm exec tauri build --config src-tauri/tauri.preview.conf.json --bundles nsis

# Linux, on Linux x64
pnpm desktop:sidecar
pnpm exec tauri build --config src-tauri/tauri.preview.conf.json --bundles appimage,deb
```

Native bundles are under `src-tauri/target/release/bundle/`. The CI collector renames them to the fixed names above and writes checksums to `dist/desktop/<platform>-x64/`. It refuses ambiguous outputs, rather than choosing an old binary. Preview packages are unsigned evaluation builds.

## What can be tested now

The bundled UI has visible controls for authenticated service readiness/restart, native folder selection, grants/revocation, list/stat/text preview, separate write consent, exact file proposals, isolated review, one-attempt dispatch and status reconciliation. Main-window controls cannot accept a proposal. Draft text never changes a file by itself. A lost dispatch response disables further dispatch of that proposal; use its operation-status control.

The command admission panel prepares exact direct/CMD/PowerShell/pwsh/sh proposals. Unsupported or missing shells fail before review; supported modes still return `LOCAL_SANDBOX_REQUIRED` without starting a process. Do not add a provider or host-runner fallback to make this demonstration execute commands.

`scripts/desktop/workspace.test.mjs` exercises frontend state with mock IPC. The native `webview-smoke` test uses tauri-driver and the actual WebView to invoke authenticated status, denied ungranted reads, denied review-document access from main, and restart. It records only measured results. Neither test claims native picker/consent or reviewed disk mutation qualification.

## Before calling this stable

1. Run all S2c.6 native-dialog and mutation acceptance cases on Windows and Linux with the actual packaged app; record OS, source SHA, package hash, observed result and exact disk contents. Include denial, conflict, restart and zero-launch cases.
2. Qualify clean-machine install/uninstall and supported upgrades/rollback, plus S4 memory/checkpoint migrations and interrupted-task recovery. Current grants remain ephemeral, and the preview is not a full AI/offline inference application.
3. Complete security review, signing, dependency inventory and provenance for final binaries. Publish only reviewed assets, then propose a desktop catalog change through review. A candidate requires native UI/install evidence; stable additionally requires recovery, upgrade, rollback and Windows signing evidence. A package build never fills these fields automatically.

## Evidence record

For each platform attach: tested source SHA, OS build, WebView version, installer SHA-256, installation method, each acceptance result, screenshot/recording of the native review and consent, and a comparison of the resulting file bytes. Keep failed/unrun cases explicit. Re-run affected checks when source or final binary changes.
