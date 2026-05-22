import * as path from 'path';
import * as fs from 'fs/promises';
import { loadFixture, loadManifest } from './harness-fixtures/loadManifest';
import { compareExpected } from './harness-fixtures/compareExpected';
import { createTempWorkspace, materializeFixtureWorkspace, snapshotWorkspace } from './harness-fixtures/materializeWorkspace';
import { runFixtureAgainstTsHarness } from './harness-fixtures/runFixture';

async function main() {
  const fixturesRoot = '/Users/jroot/.openclaw/workspace/fixtures/harness';
  const manifest = await loadManifest(fixturesRoot);

  let passed = 0;
  let failed = 0;
  const failures: Array<{ id: string; messages: string[]; actual?: unknown; }> = [];

  for (const entry of manifest.fixtures) {
    const { fixtureDir, fixture, expected } = await loadFixture(fixturesRoot, entry.path);
    const workspaceRoot = await createTempWorkspace();

    try {
      await materializeFixtureWorkspace(fixtureDir, workspaceRoot);
      const before = await snapshotWorkspace(workspaceRoot);
      const { normalized, durationMs } = await runFixtureAgainstTsHarness(workspaceRoot, fixture);
      const after = await snapshotWorkspace(workspaceRoot);
      const comparisonFailures = await compareExpected(expected, normalized, workspaceRoot, before, after);

      if (fixture.timing?.maxWallClockMs != null && durationMs > fixture.timing.maxWallClockMs) {
        comparisonFailures.push({ message: `duration ${durationMs}ms exceeded maxWallClockMs ${fixture.timing.maxWallClockMs}` });
      }

      if (comparisonFailures.length === 0) {
        passed += 1;
        console.log(`PASS ${fixture.id}`);
      } else {
        failed += 1;
        console.log(`FAIL ${fixture.id}`);
        failures.push({ id: fixture.id, messages: comparisonFailures.map(f => f.message), actual: normalized });
      }
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed, total ${passed + failed}`);

  if (failures.length > 0) {
    console.log('\nFailure details:');
    for (const failure of failures) {
      console.log(`- ${failure.id}`);
      for (const message of failure.messages) {
        console.log(`  • ${message}`);
      }
      console.log(`  actual: ${JSON.stringify(failure.actual)}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Harness fixture runner failed:', err);
  process.exit(1);
});
