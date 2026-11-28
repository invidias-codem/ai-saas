import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { lstat, open, access, readdir, readlink, realpath } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filenames = {
  windows: ['lattice-desktop-windows-x64-setup.exe'],
  linux: ['lattice-desktop-linux-x64.AppImage', 'lattice-desktop-linux-x64.deb'],
};
export async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
}
async function readEvidence(filename, limit) {
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    const original = await lstat(filename);
    assert.ok(original.isFile() && !original.isSymbolicLink(), 'Evidence must be a regular file');
    assert.ok(info.isFile() && info.dev === original.dev && info.ino === original.ino && info.size <= limit,
      'Evidence changed or exceeded its size limit');
    // Validate and read the same handle. A replaced path cannot redirect this read.
    const bytes = Buffer.alloc(limit + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(bytes, count, bytes.length - count, null);
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    assert.ok(count <= limit, 'Evidence exceeded its size limit');
    return bytes.subarray(0, count).toString('utf8');
  } finally { await handle.close(); }
}
export async function verifyPackage(directory, platform, expectedSource) {
  assert.ok(/^[a-f0-9]{40}$/.test(expectedSource), 'An exact source commit is required');
  assert.ok(Object.hasOwn(filenames, platform), 'Unsupported package platform');
  const root = path.resolve(directory);
  const rootInfo = await lstat(root);
  assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'Artifact root must be a directory');
  const manifest = JSON.parse(await readEvidence(path.join(root, 'desktop-build-manifest.json'), 65536));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.channel, 'evaluation');
  assert.equal(manifest.sourceCommit, expectedSource, 'The installer must match the tested source');
  assert.equal(manifest.platform, `${platform}-x64`);
  assert.equal(manifest.qualification.stableRelease, false);
  assert.ok(Array.isArray(manifest.artifacts));
  assert.deepEqual(manifest.artifacts.map(a => a.filename).sort(), [...filenames[platform]].sort(), 'Unexpected package set');
  const sumsPath = path.join(root, 'SHA256SUMS');
  const sums = (await readEvidence(sumsPath, 8192)).trim().split(/\r?\n/);
  assert.equal(sums.length, manifest.artifacts.length);
  for (const artifact of manifest.artifacts) {
    assert.ok(/^[a-f0-9]{64}$/.test(artifact.sha256));
    assert.ok(Number.isSafeInteger(artifact.size) && artifact.size > 0 && artifact.size <= 2 * 1024 ** 3);
    const filename = path.join(root, artifact.filename);
    const info = await lstat(filename);
    assert.ok(info.isFile() && !info.isSymbolicLink(), 'Installer must be a regular file');
    assert.equal(info.size, artifact.size);
    assert.equal(await sha256File(filename), artifact.sha256, 'Installer checksum mismatch');
    assert.ok(sums.includes(`${artifact.sha256}  ${artifact.filename}`), 'Checksums file does not match manifest');
  }
  const filename = filenames[platform].find(name => name.endsWith(platform === 'windows' ? '.exe' : '.deb'));
  const artifact = manifest.artifacts.find(a => a.filename === filename);
  return { filename, installer: path.join(root, filename), sha256: artifact.sha256, sourceCommit: expectedSource, platform };
}

const windowsHelper = fileURLToPath(new URL('./windows-package.ps1', import.meta.url));
export function assertWindowsInstallPath(directory, application) {
  assert.ok(typeof application === 'string' && path.win32.isAbsolute(application));
  assert.equal(path.win32.basename(application).toLowerCase(), 'app.exe');
  // Windows paths compare without case sensitivity, including the drive letter.
  assert.equal(path.win32.relative(path.win32.resolve(directory), path.win32.dirname(application)), '',
    'Installed application must belong to the requested test directory');
}
export async function canonicalWindowsApplication(directory, application) {
  assert.ok(typeof application === 'string' && path.win32.isAbsolute(application));
  const canonicalDirectory = await realpath(directory);
  const canonicalApplication = await realpath(application);
  // NSIS/.NET can expand an 8.3 temporary-directory alias. Compare filesystem
  // identities after resolving both spellings, then track the canonical paths.
  assertWindowsInstallPath(canonicalDirectory, canonicalApplication);
  return { directory: canonicalDirectory, application: canonicalApplication };
}
export async function installPackage(verified, directory) {
  if (verified.platform === 'windows') {
    assert.equal(process.platform, 'win32');
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', windowsHelper,
      '-Action', 'install', '-Installer', verified.installer, '-Directory', path.resolve(directory)],
    { encoding: 'utf8', timeout: 180000 });
    const state = JSON.parse(result.trim());
    const canonical = await canonicalWindowsApplication(directory, state.application);
    return { ...verified, ...canonical };
  }
  assert.equal(process.platform, 'linux');
  const packageId = execFileSync('dpkg-deb', ['--field', verified.installer, 'Package'], { encoding: 'utf8' }).trim();
  assert.match(packageId, /^[a-z0-9][a-z0-9+.-]*$/);
  const before = spawnSync('dpkg-query', ['--show', '--showformat=${db:Status-Status}', packageId], { encoding: 'utf8' });
  assert.notEqual(before.stdout, 'installed', 'Refuse to replace an existing installation in the qualification runner');
  execFileSync('sudo', ['apt-get', 'install', '-y', '--no-install-recommends', verified.installer], { stdio: 'inherit', timeout: 180000 });
  const files = execFileSync('dpkg-query', ['--listfiles', packageId], { encoding: 'utf8' }).split('\n');
  const applications = files.filter(file => /\/bin\/app$/.test(file));
  assert.equal(applications.length, 1, 'Installed application path is ambiguous');
  await access(applications[0]);
  return { ...verified, application: applications[0], packageId };
}
export async function uninstallPackage(installed) {
  if (installed.platform === 'windows') {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', windowsHelper,
      '-Action', 'uninstall', '-Directory', installed.directory], { stdio: 'inherit', timeout: 180000 });
  } else {
    assert.match(installed.packageId, /^[a-z0-9][a-z0-9+.-]*$/);
    execFileSync('sudo', ['dpkg', '--remove', installed.packageId], { stdio: 'inherit', timeout: 120000 });
  }
  await assert.rejects(access(installed.application), error => error.code === 'ENOENT', 'Application executable remained after uninstall');
  await assert.rejects(access(path.join(path.dirname(installed.application), installed.platform === 'windows' ? 'lattice-harness.exe' : 'lattice-harness')),
    error => error.code === 'ENOENT', 'Sidecar executable remained after uninstall');
}
export async function installedProcesses(installed) {
  if (installed.platform === 'windows') {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', windowsHelper,
      '-Action', 'processes', '-Directory', installed.directory], { encoding: 'utf8', timeout: 15000 });
    const ids = JSON.parse(output.trim()); assert.ok(Array.isArray(ids));
    assert.ok(ids.every(pid => Number.isSafeInteger(pid) && pid > 0)); return ids;
  }
  const expected = new Set([installed.application, path.join(path.dirname(installed.application), 'lattice-harness')]);
  const ids = [];
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const exe = (await readlink(`/proc/${entry}/exe`)).replace(/ \(deleted\)$/, '');
      if (expected.has(exe)) ids.push(Number(entry));
    } catch (error) { if (!['ENOENT','EACCES','EPERM'].includes(error.code)) throw error; }
  }
  return ids;
}
