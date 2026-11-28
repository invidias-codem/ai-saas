#!/usr/bin/env tsx
// scripts/attestation-cli.ts
// Writes a GateAttestation JSON file. Used by CI so every gate — executed
// OR skipped — leaves a commit-bound record. Exit code still reflects the
// suite result; the attestation is additive evidence, not a replacement.
//
// Usage:
//   npx tsx scripts/attestation-cli.ts write --suite X --commit SHA \
//     [--executed true|false] [--skip-reason R] [--jest-json FILE] [--out FILE]
//   npx tsx scripts/attestation-cli.ts verify --file FILE --suite X --commit SHA

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  attestationFromJestJson,
  buildAttestation,
  verifyAttestation,
} from '../lib/intelligence/attestation';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];

if (cmd === 'write') {
  const suite = arg('--suite')!;
  const commit = arg('--commit') ?? execSync('git rev-parse HEAD').toString().trim();
  const out = arg('--out') ?? `attestations/${suite}.json`;
  const jestJsonPath = arg('--jest-json');

  let att;
  if (jestJsonPath) {
    // Prefer the structured summary when present.
    const raw = JSON.parse(readFileSync(jestJsonPath, 'utf8'));
    att = attestationFromJestJson({ suite, commit, jestJson: raw });
  } else {
    const executed = arg('--executed') === 'true';
    att = buildAttestation({
      suite,
      commit,
      executed,
      ...(arg('--skip-reason') ? { skipReason: arg('--skip-reason') } : {}),
      ...(arg('--test-count') ? { testCount: Number(arg('--test-count')) } : {}),
      ...(arg('--passed') ? { passed: Number(arg('--passed')) } : {}),
      ...(arg('--failed') ? { failed: Number(arg('--failed')) } : {}),
      completedAt: new Date().toISOString(),
    });
  }

  if (!out.includes('/')) {
    writeFileSync(out, JSON.stringify(att, null, 2) + '\n');
  } else {
    const dir = out.slice(0, out.lastIndexOf('/'));
    if (dir && !existsSync(dir)) execSync(`mkdir -p ${dir}`);
    writeFileSync(out, JSON.stringify(att, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(att) + '\n');
  process.exit(0);
}

if (cmd === 'verify') {
  const file = arg('--file')!;
  const att = JSON.parse(readFileSync(file, 'utf8'));
  const result = verifyAttestation(att, {
    requiredSuite: arg('--suite')!,
    candidateCommit: arg('--commit') ?? execSync('git rev-parse HEAD').toString().trim(),
  });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ok ? 0 : 1);
}

process.stderr.write('usage: attestation-cli.ts write|verify ...\n');
process.exit(2);
