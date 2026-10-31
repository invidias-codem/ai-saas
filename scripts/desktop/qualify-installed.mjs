import { mkdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { verifyPackage, installPackage, uninstallPackage, installedProcesses, sha256File } from './package-qualification.mjs';
import { nativeUiFlow } from './native-ui-e2e.mjs';
import { until } from './qualification-webdriver.mjs';

const [directory, source, evidenceDirectory, harnessSource = source] = process.argv.slice(2);
if (!directory || !/^[a-f0-9]{40}$/.test(source ?? '') || !evidenceDirectory) throw new Error('Usage: qualify-installed.mjs <artifact-directory> <source-sha> <evidence-directory>');
if (!/^[a-f0-9]{40}$/.test(harnessSource ?? '')) throw new Error('An exact harness source commit is required');
const platform = process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : undefined;
if (!platform) throw new Error('Installed qualification currently supports Windows/Linux only');
const evidence = path.resolve(evidenceDirectory);
await mkdir(evidence, { recursive: true });
const temporary = await mkdtemp(path.join(os.tmpdir(), 'lattice-installed-qualification-'));
const fixture = path.join(temporary, 'project'); await mkdir(fixture);
const checkout = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(existsSync(path.join(checkout, 'src-tauri/target/release', platform === 'windows' ? 'app.exe' : 'app')), false,
  'Installed qualification must run on a fresh job without a source-build executable');
const report = { schemaVersion: 1, sourceCommit: source, harnessSourceCommit: harnessSource, sameSourceAsHarness: source === harnessSource, platform, architecture: os.arch(), osRelease: os.release(), osVersion: os.version(),
  scope: 'installed-package-on-hosted-ci', packageKind: platform === 'windows' ? 'nsis' : 'deb',
  measured: [], commandModes: {}, passed: false, installed: false, uninstalled: false,
  nativeDialogsTested: false, reviewedMutationTested: false, appImageRuntimeTested: false,
  manualWindows11Verified: false, cleanMachineInstallTested: false, stableReleaseQualified: false };
let installed;
let failure;
try {
  const verified = await verifyPackage(directory, platform, source);
  report.installer = { filename: verified.filename, sha256: verified.sha256 };
  report.measured.push('installer-source-platform-and-checksum-verified');
  installed = await installPackage(verified, path.join(temporary, 'application'));
  report.installed = true;
  report.applicationSha256 = await sha256File(installed.application);
  const sidecar = path.join(path.dirname(installed.application), platform === 'windows' ? 'lattice-harness.exe' : 'lattice-harness');
  await access(sidecar); report.sidecarSha256 = await sha256File(sidecar);
  report.measured.push('installed-executable-and-bundled-sidecar-present');
  const driverOptions = {};
  if (platform === 'windows') {
    const helper = fileURLToPath(new URL('./windows-webdriver.ps1', import.meta.url));
    const driver = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper,
      '-Directory', path.join(temporary, 'webdriver')], { encoding: 'utf8', timeout: 180000 }).trim());
    assert.ok(path.isAbsolute(driver.path));
    driverOptions.nativeDriver = driver.path;
    report.webviewDriver = { version: driver.version, runtimeVersion: driver.runtimeVersion };
  }
  await nativeUiFlow(installed.application, fixture, evidence, report, driverOptions);
  report.nativeDialogsTested = true; report.reviewedMutationTested = true;
} catch (error) {
  failure = error;
  report.failure = error instanceof Error ? error.message : 'Installed qualification failed';
} finally {
  if (installed) {
    try {
      await until(() => installedProcesses(installed), ids => ids.length === 0, 15000);
      report.measured.push('installed-app-and-sidecar-exit-confirmed');
      await uninstallPackage(installed); report.uninstalled = true;
      await access(path.join(fixture, 'seed.txt'));
      report.measured.push('uninstall-removes-app-and-preserves-project-files');
    } catch (error) {
      report.uninstallFailure = error instanceof Error ? error.message : 'Uninstall failed';
      failure ??= error;
    }
  }
  report.passed = !failure && report.installed && report.uninstalled && report.nativeDialogsTested && report.reviewedMutationTested;
  await writeFile(path.join(evidence, 'installed-qualification.json'), `${JSON.stringify(report, null, 2)}\n`);
  // Remove only this run's synthetic project after native ownership has ended.
  if (report.uninstalled) await rm(temporary, { recursive: true, force: true });
}
if (failure) throw failure;
console.log('Installed package, native dialogs, reviewed mutations and uninstall verified on the recorded CI OS. Stable/manual OS gates remain open.');

