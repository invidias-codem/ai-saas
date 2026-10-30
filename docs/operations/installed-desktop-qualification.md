# Installed desktop qualification

This continues the evaluation-package slice in #460. Its purpose is to exercise the installed executable and its packaged sidecar through native OS dialogs and actual WebView IPC. It does not enable stable downloads, company command execution or a test approval bypass.

## Scope and evidence

The `installed-qualification` jobs in `desktop-packages.yml` run after the package matrix. Each job starts on a fresh hosted runner, downloads its own source-matched artifact, and refuses to run if a source-build executable is present. The harness uses Node built-ins and an external tauri-driver; the application is not launched through a development server or the repository's release binary.

| Platform | Installed format | Test host | Qualification limit |
| --- | --- | --- | --- |
| Linux x64 | Debian package | Ubuntu 22.04 | AppImage execution and other distributions remain separate |
| Windows x64 | Current-user NSIS installer | Windows Server 2022 | Manual Windows 11 verification remains required |

Hosted CI contains development tools. These jobs provide installed-package evidence, not a claim that a pristine consumer OS has been tested without SDKs. The reports always retain `cleanMachineInstallTested: false`, `manualWindows11Verified: false` and `stableReleaseQualified: false`.

## Admission before installation

`package-qualification.mjs` verifies the artifact's exact source commit, platform and closed package set. It rejects symbolic-link installers, arbitrary manifest paths, missing or mismatched SHA256SUMS, incorrect sizes, and altered bytes before invoking any installer. New Windows installations use a unique temporary path. Linux refuses to replace an existing installation of the package.

## Native UI flow

The harness drives the same packaged interface that a tester sees. Native picker and consent responses use xdotool on Linux and Windows UI Automation/SendKeys on Windows. Review acceptance is performed by a trusted WebDriver click on the isolated review's button. It never calls `native_review_decide` to manufacture acceptance or supplies folder grants or daemon credentials.

All file activity is confined to a synthetic temporary project created by the harness. The flow covers:

1. Folder-picker cancellation and denied read consent leave no grant.
2. Native folder selection plus confirmation creates a read-only grant; list/stat and UTF-8 preview match the fixture on disk.
3. Traversal is rejected. Denied write consent preserves the read-only ceiling, and accepted write consent remains separate from an exact mutation approval.
4. Review denial creates no file. Accepted creation writes the exact displayed bytes, and replay of the consumed proposal is rejected.
5. An external edit causes a conflict without overwriting it. A fresh review of the changed base allows replacement.
6. Revocation removes access and displayed content. Restart retires grants, proposals and an open review window.
7. Every command mode is either unavailable before review or denied with `LOCAL_SANDBOX_REQUIRED`. No command marker is created and denied commands expose no output.
8. The app and sidecar exit, uninstall removes the installed executables, and the project files remain intact.

`installed-qualification.json` records only completed observations, the actual OS/WebView, installer and installed-component hashes, command outcomes, and failures. Screenshots are captured at native dialogs and the review window. A failed or incomplete run does not set native UI or mutation qualification to true. No installer manifest or public downloads catalog is automatically promoted by these tests.

## Running locally

Use a disposable test machine and an evaluation artifact from the exact source being tested. Install tauri-driver 2.1.0 and the platform's matching native WebDriver. Linux also needs xdotool, ImageMagick, Xvfb, xauth and a DBus session; Windows needs a visible interactive session and matching Edge/WebView2 tooling.

```sh
# Replace the SHA with the artifact manifest's exact source commit.
node scripts/desktop/qualify-installed.mjs artifacts/windows SOURCE_SHA desktop/evidence/windows
dbus-run-session -- xvfb-run -a node scripts/desktop/qualify-installed.mjs artifacts/linux SOURCE_SHA desktop/evidence/linux
```

The Linux flow installs/removes its Debian package with sudo. Windows installs only under the harness's new temporary directory. The harness does not remove persistent application data or promote a public release. Retain the per-platform report and screenshots with the tested installer hash before completing the corresponding release gate.
