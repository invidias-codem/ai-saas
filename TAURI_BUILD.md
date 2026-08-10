# Building Lattice OS with Tauri 2.x

This repo includes a first-class desktop shell in `src-tauri/`. The web app is the default path; the Tauri app adds native IPC, encrypted secret storage, and lifecycle-aware telemetry.

## Prerequisites

- Node.js >= 18
- pnpm >= 9
- Rust >= 1.75
- Cargo
- OS build deps:
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential`, `libssl-dev`, `libwebkit2gtk-4.1-dev`
  - Windows: Visual Studio C++ Build Tools + Microsoft WebView2 + GNU toolchain (`dlltool.exe` / `x86_64-pc-windows-gnu`)

## Windows Setup

1. **Install build tools**
   - Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.
   - Install [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

2. **Install pnpm**
   ```powershell
   npm install -g pnpm
   ```

3. **Install Rust + GNU toolchain**
   - Download and run the installer from https://rustup.rs/
   - When prompted, select the GNU toolchain: `stable-x86_64-pc-windows-gnu`
   - After install, **close PowerShell completely** and reopen it so PATH reloads.
   - Verify:
     ```powershell
     rustup --version
     cargo --version
     ```

   **Why GNU?** The Tauri/Rust build on Windows expects the MinGW/GNU ABI. The default MSVC toolchain can fail with linker errors like `dlltool.exe: program not found`.

4. **Clone and install**
   ```bash
   git clone https://github.com/invidias-codem/ai-saas.git
   cd ai-saas
   pnpm install
   ```

5. **Run**
   ```bash
   pnpm tauri dev
   ```

**Notes**
- If `rustup` is not found after install, restart the terminal or your editor's integrated shell.
- If Rust was installed via Chocolatey, the GNU toolchain and `rustup` may still be missing; the rustup-init installer above is the most reliable path on Windows.
- If `pnpm tauri dev` fails immediately on the before-command, this repo now uses `cross-env` so `NEXT_PUBLIC_IS_DESKTOP=true` works in PowerShell/CMD.
- If you install MinGW/MSYS2 separately, make sure your PATH points to the `bin` directory, not to an executable inside it. For example, use `C:\msys64\mingw64\bin`, not `C:\msys64\mingw64\bin\gcc.exe`.

## Install

```bash
pnpm install
```

## Development

```bash
pnpm tauri dev
```

This starts the Next.js frontend and the Tauri window with hot reload. The app runs at `http://localhost:1420` by default.

## Production Build

```bash
pnpm tauri build
```

Outputs land under `src-tauri/target/release/bundle/` as platform installers.

## Native Feature Wiring (Already Implemented)

The following native capabilities are already scaffolded and ready for a Rust toolchain:

### Phase 1 — IPC Bridge
- Rust commands: `ping_daemon`, `flush_telemetry`
- Capability manifest: `src-tauri/capabilities/default.json`
- Frontend imports: `@tauri-apps/api/core`, `@tauri-apps/api/event`
- Frontend guard: `hooks/useHarnessHeartbeat.ts` uses `isTauri` + dynamic imports

### Phase 2 — Secure Credential Storage
- Tauri plugin: `tauri-plugin-stronghold = "2"`
- Frontend abstraction: `lib/native/secretStore.ts`
- Settings integration: OpenRouter keys can be stored via Stronghold when running natively
- Capability permissions: `stronghold:allow-*` scopes declared in `default.json`

### Phase 3 — Telemetry Lifecycle
- Window focus/blur listeners throttle heartbeat polling when backgrounded
- Window close listener resets daemon state cleanly
- Frontend module: `hooks/useHarnessHeartbeat.ts`
- Capability permissions: `window:default`, `window:allow-get-current-window`

## Environment Detection

The app auto-detects native vs browser via:

```ts
const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);
```

Settings UI in `app/[locale]/(dashboard)/(routes)/settings/local-capabilities/page.tsx` shows live Runtime Environment, Native Secret Vault, and IPC Daemon status.

## BYOK Provider Integration

OpenRouter is wired as a BYOK provider. In Tauri mode, keys saved in Settings prefer Stronghold; in browser mode, they fall back to `/api/settings/keys`. Model picker visibility is gated by configured key state.

## Troubleshooting

- **IPC silently failing**: Ensure `default.json` permissions include the command being invoked. Tauri v2 deny-by-default; missing capabilities are silent failures.
- **Stronghold errors**: Verify `tauri-plugin-stronghold = "2"` in `Cargo.toml` and the `stronghold:allow-*` scopes in `default.json`.
- **WebView runtime issues**: Update WebView2 on Windows; ensure system WebKit is current on Linux.
- **Frontend import errors**: Use `@tauri-apps/api/core`, `@tauri-apps/api/event`, and `@tauri-apps/api/window` for v2 APIs.
