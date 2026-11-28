// Diagnostic capability discovery ONLY. This module does not authorize execution,
// start VMs, auto-install dependencies, or bypass native operation approval.
import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function selectMacRuntimeCandidate({ platform, arch, versionMajor, hypervisorSupported, appleContainerFound, limaFound }) {
  const denied = reason => ({ candidate: null, executionEnabled: false, reason });
  if (platform !== 'darwin') return denied('not_macos');
  if (arch !== 'arm64' && arch !== 'x64') return denied('unsupported_cpu');
  if (!Number.isInteger(versionMajor) || versionMajor < 13) return denied('unsupported_macos_version');
  if (hypervisorSupported !== true) return denied('hypervisor_not_verified');
  if (arch === 'arm64' && versionMajor >= 26 && appleContainerFound === true) {
    return { candidate: 'apple-container', executionEnabled: false, reason: 'candidate_only_unqualified' };
  }
  if (limaFound === true) {
    return { candidate: 'lima', executionEnabled: false, reason: 'candidate_only_unqualified' };
  }
  return denied('no_supported_backend_found');
}

function readMacCommand(executable, args) {
  try {
    return execFileSync(executable, args, { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function executableOnPath(name, envPath) {
  for (const directory of (envPath || '').split(path.delimiter)) {
    // Never consider the working directory from an empty PATH element.
    if (!directory || !path.isAbsolute(directory)) continue;
    try {
      accessSync(path.join(directory, name), constants.X_OK);
      return true;
    } catch {
      // Continue searching, but never execute discovered commands.
    }
  }
  return false;
}

export function collectMacRuntimeDiagnostic({ platform = process.platform, arch = process.arch, envPath = process.env.PATH } = {}) {
  const macos = platform === 'darwin';
  const version = macos ? readMacCommand('/usr/bin/sw_vers', ['-productVersion']) : null;
  const versionMajor = version && /^\d+/.test(version) ? Number.parseInt(version, 10) : null;
  const hv = macos ? readMacCommand('/usr/sbin/sysctl', ['-n', 'kern.hv_support']) : null;
  const signals = {
    platform,
    processArchitecture: arch, // May reflect Rosetta translation, not physical CPU.
    osVersion: version,
    hypervisorSupported: hv === '1',
    appleContainerFound: macos && executableOnPath('container', envPath),
    limaFound: macos && executableOnPath('limactl', envPath),
  };
  return {
    schemaVersion: 1,
    host: signals,
    runtime: selectMacRuntimeCandidate({
      platform, arch, versionMajor, hypervisorSupported: hv === '1',
      appleContainerFound: signals.appleContainerFound, limaFound: signals.limaFound,
    }),
    qualification: 'none',
    note: 'Diagnostic only; executable presence is not proof of an operational or secure sandbox.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(collectMacRuntimeDiagnostic(), null, 2));
}
