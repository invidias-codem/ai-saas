import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExpectedResult, NormalizedResult, SnapshotEntry } from './types';

export interface ComparisonFailure {
  message: string;
}

function assertContains(subject: string | null, values: string[] | undefined, failures: ComparisonFailure[], label: string) {
  if (!values) return;
  const text = subject ?? '';
  for (const value of values) {
    if (!text.includes(value)) {
      failures.push({ message: `${label} does not contain expected substring: ${value}` });
    }
  }
}

function assertNotContains(subject: string | null, values: string[] | undefined, failures: ComparisonFailure[], label: string) {
  if (!values) return;
  const text = subject ?? '';
  for (const value of values) {
    if (text.includes(value)) {
      failures.push({ message: `${label} unexpectedly contains substring: ${value}` });
    }
  }
}

function assertLength(subject: string | null, rule: ExpectedResult['output'] extends infer T ? T extends { length?: infer U } ? U : never : never, failures: ComparisonFailure[], label: string) {
  if (!rule) return;
  const len = (subject ?? '').length;
  if ((rule as any).equals != null && len !== (rule as any).equals) failures.push({ message: `${label} length ${len} !== expected ${(rule as any).equals}` });
  if ((rule as any).min != null && len < (rule as any).min) failures.push({ message: `${label} length ${len} < expected min ${(rule as any).min}` });
  if ((rule as any).max != null && len > (rule as any).max) failures.push({ message: `${label} length ${len} > expected max ${(rule as any).max}` });
}

async function readIfExists(root: string, relativePath: string): Promise<SnapshotEntry> {
  const abs = path.join(root, relativePath);
  try {
    const content = await fs.readFile(abs, 'utf8');
    return { exists: true, content };
  } catch {
    return { exists: false };
  }
}

export async function compareExpected(expected: ExpectedResult, actual: NormalizedResult, workspaceRoot: string, before: Map<string, SnapshotEntry>, after: Map<string, SnapshotEntry>): Promise<ComparisonFailure[]> {
  const failures: ComparisonFailure[] = [];

  if (typeof expected.ok === 'boolean' && actual.ok !== expected.ok) {
    failures.push({ message: `ok mismatch: actual=${actual.ok} expected=${expected.ok}` });
  }

  if (Object.prototype.hasOwnProperty.call(expected, 'code') && actual.code !== (expected.code ?? null)) {
    failures.push({ message: `code mismatch: actual=${actual.code} expected=${expected.code}` });
  }

  if (expected.output?.equals != null && actual.output !== expected.output.equals) {
    failures.push({ message: `output mismatch: actual=${JSON.stringify(actual.output)} expected=${JSON.stringify(expected.output.equals)}` });
  }
  assertContains(actual.output, expected.output?.contains, failures, 'output');
  assertNotContains(actual.output, expected.output?.notContains, failures, 'output');
  assertLength(actual.output, expected.output?.length as any, failures, 'output');

  if (expected.error?.equals != null && actual.error !== expected.error.equals) {
    failures.push({ message: `error mismatch: actual=${JSON.stringify(actual.error)} expected=${JSON.stringify(expected.error.equals)}` });
  }
  assertContains(actual.error, expected.error?.contains, failures, 'error');
  assertNotContains(actual.error, expected.error?.notContains, failures, 'error');

  if (expected.meta) {
    for (const [key, expectedValue] of Object.entries(expected.meta)) {
      const actualValue = (actual.meta as any)[key];
      if (expectedValue !== undefined && actualValue !== expectedValue) {
        failures.push({ message: `meta.${key} mismatch: actual=${actualValue} expected=${expectedValue}` });
      }
    }
  }

  if (expected.files?.exists) {
    for (const rel of expected.files.exists) {
      const state = await readIfExists(workspaceRoot, rel);
      if (!state.exists) failures.push({ message: `expected file to exist: ${rel}` });
    }
  }

  if (expected.files?.notExists) {
    for (const rel of expected.files.notExists) {
      const state = await readIfExists(workspaceRoot, rel);
      if (state.exists) failures.push({ message: `expected file not to exist: ${rel}` });
    }
  }

  if (expected.files?.contentEquals) {
    for (const [rel, expectedContent] of Object.entries(expected.files.contentEquals)) {
      const state = await readIfExists(workspaceRoot, rel);
      if (!state.exists) {
        failures.push({ message: `expected file missing for contentEquals: ${rel}` });
      } else if (state.content !== expectedContent) {
        failures.push({ message: `file content mismatch for ${rel}` });
      }
    }
  }

  if (expected.files?.contentContains) {
    for (const [rel, substrings] of Object.entries(expected.files.contentContains)) {
      const state = await readIfExists(workspaceRoot, rel);
      if (!state.exists) {
        failures.push({ message: `expected file missing for contentContains: ${rel}` });
      } else {
        for (const substring of substrings) {
          if (!(state.content ?? '').includes(substring)) {
            failures.push({ message: `file ${rel} missing expected substring: ${substring}` });
          }
        }
      }
    }
  }

  if (expected.files?.contentNotContains) {
    for (const [rel, substrings] of Object.entries(expected.files.contentNotContains)) {
      const state = await readIfExists(workspaceRoot, rel);
      if (!state.exists) {
        failures.push({ message: `expected file missing for contentNotContains: ${rel}` });
      } else {
        for (const substring of substrings) {
          if ((state.content ?? '').includes(substring)) {
            failures.push({ message: `file ${rel} unexpectedly contains substring: ${substring}` });
          }
        }
      }
    }
  }

  if (expected.files?.changed) {
    for (const rel of expected.files.changed) {
      const b = before.get(rel);
      const a = after.get(rel);
      const changed = !b || !a || b.content !== a.content;
      if (!changed) failures.push({ message: `expected file to change: ${rel}` });
    }
  }

  if (expected.files?.unchanged) {
    for (const rel of expected.files.unchanged) {
      const b = before.get(rel);
      const a = after.get(rel);
      const unchanged = (!!b || !!a) ? (b?.content === a?.content) : true;
      if (!unchanged) failures.push({ message: `expected file to remain unchanged: ${rel}` });
    }
  }

  return failures;
}
