import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectMacRuntimeCandidate, collectMacRuntimeDiagnostic } from './macos-runtime-probe.mjs';

const host = { platform: 'darwin', arch: 'arm64', versionMajor: 26, hypervisorSupported: true, appleContainerFound: true, limaFound: true };

test('Apple container is a candidate only on supported ARM macOS 26+ hosts', () => {
  assert.deepEqual(selectMacRuntimeCandidate(host), {
    candidate: 'apple-container', executionEnabled: false, reason: 'candidate_only_unqualified',
  });
  assert.equal(selectMacRuntimeCandidate({ ...host, arch: 'x64' }).candidate, 'lima');
  assert.equal(selectMacRuntimeCandidate({ ...host, versionMajor: 15 }).candidate, 'lima');
});

test('Intel Macs can select Lima as a candidate without pretending Apple container works', () => {
  const intel = { ...host, arch: 'x64', appleContainerFound: true };
  assert.equal(selectMacRuntimeCandidate(intel).candidate, 'lima');
  assert.equal(selectMacRuntimeCandidate({ ...intel, limaFound: false }).candidate, null);
});

test('unsupported hosts and unavailable hypervisors fail closed', () => {
  for (const changed of [
    { platform: 'linux' }, { arch: 'ia32' }, { versionMajor: 12 },
    { versionMajor: null }, { hypervisorSupported: false },
    { hypervisorSupported: null }, { appleContainerFound: false, limaFound: false },
  ]) {
    const result = selectMacRuntimeCandidate({ ...host, ...changed });
    assert.equal(result.candidate, null);
    assert.equal(result.executionEnabled, false);
  }
});

test('diagnostics do not claim an active or qualified sandbox', () => {
  const result = collectMacRuntimeDiagnostic({ platform: 'linux', arch: 'x64', envPath: '' });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.runtime.candidate, null);
  assert.equal(result.runtime.executionEnabled, false);
  assert.equal(result.qualification, 'none');
});
