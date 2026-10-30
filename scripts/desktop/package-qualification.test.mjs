import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyPackage } from './package-qualification.mjs';

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
