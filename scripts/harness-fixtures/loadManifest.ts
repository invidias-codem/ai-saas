import * as fs from 'fs/promises';
import * as path from 'path';
import type { ExpectedResult, FixtureFile, FixtureManifest } from './types';

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function loadManifest(fixturesRoot: string): Promise<FixtureManifest> {
  return readJsonFile<FixtureManifest>(path.join(fixturesRoot, 'manifest.json'));
}

export async function loadFixture(fixturesRoot: string, relativeFixturePath: string): Promise<{ fixtureDir: string; fixture: FixtureFile; expected: ExpectedResult; }> {
  const fixtureDir = path.join(fixturesRoot, relativeFixturePath);
  const fixture = await readJsonFile<FixtureFile>(path.join(fixtureDir, 'fixture.json'));
  const expected = await readJsonFile<ExpectedResult>(path.join(fixtureDir, 'expected.json'));
  return { fixtureDir, fixture, expected };
}
