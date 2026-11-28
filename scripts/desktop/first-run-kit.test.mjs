import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeFirstRunKit, welcomeText } from './first-run-kit.mjs';

test('Windows download includes a source-bound guide, safe sample, and manual feedback form', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lattice-first-run-'));
  try {
    const source = 'a'.repeat(40);
    await writeFirstRunKit(directory, 'windows', source);
    assert.deepEqual((await readdir(directory)).sort(), ['Lattice Test Workspace', 'START-HERE-WINDOWS.txt', 'TEST-NOTES.txt']);
    assert.equal(await readFile(path.join(directory, 'Lattice Test Workspace/welcome.txt'), 'utf8'), welcomeText);
    const guide = await readFile(path.join(directory, 'START-HERE-WINDOWS.txt'), 'utf8');
    assert.ok(guide.startsWith(`Source commit: ${source}\n`));
    assert.match(guide, /No cloud login or development server should appear/);
    assert.match(guide, /Apply accepted change/);
    const notes = await readFile(path.join(directory, 'TEST-NOTES.txt'), 'utf8');
    assert.match(notes, new RegExp(source));
    assert.match(notes, /does not send this report automatically/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Linux kit uses the same sample without presenting Windows setup instructions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lattice-first-run-'));
  try {
    await writeFirstRunKit(directory, 'linux', 'b'.repeat(40));
    assert.deepEqual((await readdir(directory)).sort(), ['Lattice Test Workspace', 'TEST-NOTES.txt']);
    assert.equal(await readFile(path.join(directory, 'Lattice Test Workspace/welcome.txt'), 'utf8'), welcomeText);
    await assert.rejects(writeFirstRunKit(directory, 'windows', '../unknown'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
