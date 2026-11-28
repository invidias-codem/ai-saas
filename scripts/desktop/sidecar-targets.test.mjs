import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sidecarForHost } from './sidecar-targets.mjs';

test('both macOS architectures map to their own Tauri sidecar names and Go targets', () => {
  assert.deepEqual(sidecarForHost('darwin', 'arm64'), {
    triple: 'aarch64-apple-darwin', goos: 'darwin', goarch: 'arm64',
  });
  assert.deepEqual(sidecarForHost('darwin', 'x64'), {
    triple: 'x86_64-apple-darwin', goos: 'darwin', goarch: 'amd64',
  });
});

test('existing Windows and Linux sidecar contracts are unchanged', () => {
  assert.equal(sidecarForHost('win32', 'x64').triple, 'x86_64-pc-windows-msvc');
  assert.equal(sidecarForHost('linux', 'x64').triple, 'x86_64-unknown-linux-gnu');
});

test('unsupported platforms fail closed without a generic or translated binary', () => {
  for (const [platform, arch] of [
    ['darwin', 'ia32'], ['darwin', 'universal'], ['linux', 'arm64'],
    ['win32', 'arm64'], ['freebsd', 'x64'], ['darwin', 'ARM64'],
  ]) assert.equal(sidecarForHost(platform, arch), null);
});
