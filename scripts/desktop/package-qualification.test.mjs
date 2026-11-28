import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir, symlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyPackage, assertWindowsInstallPath, canonicalWindowsApplication } from './package-qualification.mjs';

const source = 'a'.repeat(40);
const fixture = async (change = value => value) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lattice-install-integrity-'));
  const filename = 'lattice-desktop-windows-x64-setup.exe';
  const bytes = Buffer.from('installer fixture, never executed');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await writeFile(path.join(root, filename), bytes);
  await writeFile(path.join(root, 'SHA256SUMS'), `${sha256}  ${filename}\n`);
  const manifest = change({ schemaVersion: 1, channel: 'evaluation', platform: 'windows-x64', sourceCommit: source,
    artifacts: [{ filename, size: bytes.length, sha256 }],
    qualification: { nativeUi: 'pending', cleanMachineInstall: 'pending', stableRelease: false } });
  await writeFile(path.join(root, 'desktop-build-manifest.json'), JSON.stringify(manifest));
  return { root, filename };
};
test('only an exact source/platform package with matching bytes can be installed', async () => {
  const { root, filename } = await fixture();
  try { const result = await verifyPackage(root, 'windows', source); assert.equal(result.filename, filename); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('tampered package bytes fail before any installer executes', async () => {
  const { root, filename } = await fixture();
  try { await writeFile(path.join(root, filename), 'tampered'); await assert.rejects(verifyPackage(root, 'windows', source)); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('Windows install path comparison accepts drive-letter case while rejecting a different directory', () => {
  assertWindowsInstallPath('C:\\Users\\Tester\\Preview', 'c:\\Users\\Tester\\Preview\\app.exe');
  assert.throws(() => assertWindowsInstallPath('C:\\Users\\Tester\\Preview', 'C:\\Users\\Tester\\Other\\app.exe'));
  assert.throws(() => assertWindowsInstallPath('C:\\Users\\Tester\\Preview', 'C:\\Users\\Tester\\Preview\\other.exe'));
});
test('a directory alias resolves to the installed Windows application without accepting another directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lattice-install-path-'));
  try {
    const directory = path.join(root, 'application'); await mkdir(directory);
    const application = path.join(directory, 'app.exe'); await writeFile(application, 'not executed');
    const alias = path.join(root, 'alias'); await symlink(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const canonical = await canonicalWindowsApplication(alias, application);
    assert.equal(canonical.directory, await realpath(directory));
    assert.equal(canonical.application, await realpath(application));
    await assert.rejects(canonicalWindowsApplication(root, application));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('oversized manifests and checksum files fail before parsing or execution', async () => {
  for (const [filename, size] of [['desktop-build-manifest.json', 65537], ['SHA256SUMS', 8193]]) {
    const { root } = await fixture();
    try { await writeFile(path.join(root, filename), ' '.repeat(size)); await assert.rejects(verifyPackage(root, 'windows', source)); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});
test('a source mismatch or arbitrary manifest path cannot select executable content', async () => {
  for (const change of [m => ({ ...m, sourceCommit: 'b'.repeat(40) }), m => ({ ...m, artifacts: [{ ...m.artifacts[0], filename: '../untrusted.exe' }] })]) {
    const { root } = await fixture(change);
    try { await assert.rejects(verifyPackage(root, 'windows', source)); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});
test('a symbolic link cannot redirect the verified installer to another file', async () => {
  const { root, filename } = await fixture();
  try {
    const { symlink } = await import('node:fs/promises');
    await rm(path.join(root, filename));
    await symlink('desktop-build-manifest.json', path.join(root, filename));
    await assert.rejects(verifyPackage(root, 'windows', source));
  } finally { await rm(root, { recursive: true, force: true }); }
});
