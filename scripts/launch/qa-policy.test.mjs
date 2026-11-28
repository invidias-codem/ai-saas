import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget, parseArgs, checkDocumentState, VIEWPORTS } from './qa-policy.mjs';

test('accepts only exact Lattice production or team Preview routes', () => {
  const prod = parseTarget('https://gen1e.xyz/en/launch');
  assert.equal(prod.production, true);
  assert.equal(prod.preview, false);
  const preview = parseTarget('https://ai-saas-g2a5qfkso-invidias-codems-projects.vercel.app/en/launch');
  assert.equal(preview.preview, true);
  assert.equal(parseTarget('https://gen1e.xyz/en/code/builder', 'builder').path, '/en/code/builder');
  assert.deepEqual([...VIEWPORTS], [320, 375, 390, 1440]);
});

test('rejects token-exfiltration destinations and URL tricks', () => {
  for (const url of [
    'https://evil.example/en/launch',
    'https://gen1e.xyz.evil.com/en/launch',
    'https://gen1e.xyz@evil.example/en/launch',
    'http://gen1e.xyz/en/launch',
    'https://gen1e.xyz:8443/en/launch',
    'https://gen1e.xyz/en/launch?x=1',
    'https://gen1e.xyz/en/launch#fragment',
    'https://gen1e.xyz/en/launch/../../api/keys',
    'https://other-invidias-codems-projects.vercel.app/en/launch',
    'https://ai-saas-test-otherteam.vercel.app/en/launch',
    'javascript:alert(1)',
  ]) assert.throws(() => parseTarget(url), { name: 'Error' }, url);
});

test('rejects unknown CLI options, missing URLs and wrong page kinds', () => {
  assert.throws(() => parseTarget('https://gen1e.xyz/en/code/builder'));
  assert.throws(() => parseTarget('https://gen1e.xyz/en/launch', 'unknown'));
  assert.throws(() => parseArgs(['--url', 'https://gen1e.xyz/en/launch', '--bad', '1']));
  assert.throws(() => parseArgs([]));
  assert.equal(parseArgs(['--url', 'https://gen1e.xyz/en/launch']).output, 'launch-qa-artifacts');
});

test('detects overflow and missing structural accessibility evidence', () => {
  const sample = {
    main: true, h1: 1, skip: true, duplicateIds: [], unlabeled: [],
    scrollWidth: 390, bodyScrollWidth: 390,
  };
  assert.deepEqual(checkDocumentState(sample, 390), []);
  const failures = checkDocumentState({
    ...sample, scrollWidth: 450, h1: 0, unlabeled: ['button'],
  }, 390);
  assert.ok(failures.some(s => s.includes('overflow')));
  assert.ok(failures.some(s => s.includes('H1')));
  assert.ok(failures.some(s => s.includes('controls')));
});
