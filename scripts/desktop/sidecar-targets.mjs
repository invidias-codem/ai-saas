// One authoritative mapping for Tauri's platform-specific Go sidecar name.
const TARGETS = Object.freeze({
  'darwin:arm64': Object.freeze({ triple: 'aarch64-apple-darwin', goos: 'darwin', goarch: 'arm64' }),
  'darwin:x64': Object.freeze({ triple: 'x86_64-apple-darwin', goos: 'darwin', goarch: 'amd64' }),
  'linux:x64': Object.freeze({ triple: 'x86_64-unknown-linux-gnu', goos: 'linux', goarch: 'amd64' }),
  'win32:x64': Object.freeze({ triple: 'x86_64-pc-windows-msvc', goos: 'windows', goarch: 'amd64' }),
});

export function sidecarForHost(platform, arch) {
  return TARGETS[[platform, arch].join(':')] ?? null;
}
