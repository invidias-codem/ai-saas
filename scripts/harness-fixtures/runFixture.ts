import { LocalIOHarness } from '@/lib/harness/LocalIOHarness';
import type { FixtureFile, NormalizedResult } from './types';
import { normalizeTsResult } from './normalizeTsResult';

async function runSingleOperation(harness: LocalIOHarness, operation: string, inputs: Record<string, unknown>): Promise<any> {
  switch (operation) {
    case 'read_file':
      return harness.readFile(String(inputs.filePath));
    case 'write_file':
      return harness.writeFile(String(inputs.filePath), String(inputs.content ?? ''));
    case 'patch_file':
      return harness.patchFile(String(inputs.filePath), String(inputs.search_block ?? ''), String(inputs.replace_block ?? ''));
    case 'run_command':
      return harness.runCommand(String(inputs.command), typeof inputs.timeoutMs === 'number' ? inputs.timeoutMs : undefined);
    default:
      throw new Error(`Unsupported fixture operation: ${operation}`);
  }
}

export async function runFixtureAgainstTsHarness(workspaceRoot: string, fixture: FixtureFile): Promise<{ rawResult: any; normalized: NormalizedResult; durationMs: number; }> {
  const harness = new LocalIOHarness(workspaceRoot);
  await harness.initialize();

  const start = Date.now();
  let rawResult: any;

  if (fixture.operation === 'compound' && fixture.steps?.length) {
    for (const step of fixture.steps) {
      rawResult = await runSingleOperation(harness, step.operation, step.inputs);
    }
  } else if (fixture.inputs) {
    rawResult = await runSingleOperation(harness, fixture.operation, fixture.inputs);
  } else {
    throw new Error(`Fixture ${fixture.id} has no executable inputs/steps.`);
  }

  const durationMs = Date.now() - start;
  const normalized = normalizeTsResult(rawResult);
  return { rawResult, normalized, durationMs };
}
