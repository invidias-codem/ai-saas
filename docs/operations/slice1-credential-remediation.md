# Slice 1 credential and profile remediation

PR #465 retains native OS credential storage and profile-ID/channel authorization. This follow-up fixes the failures observed at `37231f8a` and tests the storage/IPC behavior they had blocked.

| Finding | Result |
| --- | --- |
| Root rustfmt configuration enabled nightly options and changed existing workspace formatting | Stable 2021 formatting, Rust 1.99.1 pinned for development and native CI; the whole workspace is checked |
| Credential-broker dependencies were absent from the checked-in lockfile | Workspace lockfile refreshed while retaining every previously locked package version; locked builds remain required |
| Windows BOOL handling was inverted and enumeration hid errors | Native success/error handling corrected; only not-found becomes an empty result; credential allocations are freed on every return path |
| macOS backend used incompatible password APIs and returned an empty inventory stub | Uses the pinned Keychain APIs and service-scoped account enumeration |
| Linux Secret Service had no async-runtime feature | Explicit Tokio/Rust-crypto backend; unused Tauri and libdbus dependencies removed from the broker crate |
| Keyring initialization could prevent the whole desktop workspace from starting | Linux connects lazily on credential access; missing storage remains an explicit error, with no production memory fallback |
| Explicit test-store builds had incompatible async traits and competing constructors | Test fixture selected only under both `cfg(test)` and `test-store`; a missing-bus integration test also verifies production dependencies cannot use it |
| Credential verification always returned true | Checks presence and propagates store failures; it does not perform a paid provider verification request |
| JS arguments/response fields did not match native serialization | CamelCase IPC inputs and outputs match the existing TypeScript contract; endpoint configuration remains separate from credential metadata |
| New native commands lacked explicit capability declarations | Credential/profile groups are available only to the local main webview; remote and review-window denial is tested |
| First-run profiles canonicalized nonexistent directories before creating them | Shared native path checks support first creation, separate channels, reject traversal/linked paths, and use unique temporary files for atomic replacement |
| Native path/profile failures could become guessed paths or an empty inventory in JS | Errors propagate; new profile defaults are saved before creation returns |

Local validation used Rust 1.99.1 and Go 1.27.3:

- 16 Tauri shell/IPC/profile tests passed, including the real Tauri permission resolver.
- 64 native-host tests passed, including the current Go daemon and process/lifecycle helpers.
- Five broker contract tests and the Linux missing-keyring integration suite passed.
- Nine TypeScript client/profile/path tests and the full application TypeScript check passed.
- Workspace formatting and Linux clippy checks passed. Broker Windows GNU and Apple ARM64 cross-checks/clippy also passed; these validate compilation, not native OS execution.
- A three-OS broker CI matrix checks production backends, actual Windows/macOS keychain round trips and explicit test fixtures. Existing shell, installer and WebView qualification jobs remain in place.

No native release catalog is activated by this remediation. Cross-compilation does not replace actual Windows/macOS keychain execution or installed-UI qualification. CI results for the pushed revision remain authoritative for those checks.
