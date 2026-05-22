import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { SnapshotEntry } from './types';

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function createTempWorkspace(prefix = 'ts-harness-fixture-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function materializeFixtureWorkspace(fixtureDir: string, workspaceRoot: string): Promise<void> {
  const seedDir = path.join(fixtureDir, 'workspace');
  try {
    const stat = await fs.stat(seedDir);
    if (stat.isDirectory()) {
      await copyDir(seedDir, workspaceRoot);
    }
  } catch {
    // no-op if workspace seed dir absent
  }
}

export async function snapshotWorkspace(root: string): Promise<Map<string, SnapshotEntry>> {
  const result = new Map<string, SnapshotEntry>();

  async function walk(current: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        const content = await fs.readFile(absolute, 'utf8');
        result.set(relative, { exists: true, content });
      }
    }
  }

  await walk(root);
  return result;
}
