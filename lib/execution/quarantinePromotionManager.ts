import { mkdir, rm, readFile, writeFile, stat, readdir } from 'fs/promises';
import { join, dirname as pathDir } from 'path';
import { execSync } from 'child_process';
import type { IPromotionManager, QuarantineArtifact } from './sandboxManager';

function buildLocalAdapter(
  quarantineRoot: string,
  liveRoot: string,
  emitRiskEvent: (event: string, payload: Record<string, unknown>) => void,
): IPromotionManager {
  const sha1 = (filePath: string): string => {
    const raw = execSync(`openssl sha1 -hex "${filePath}"`, { encoding: 'utf8' }).trim();
    return raw.replace(/^SHA1\([^)]+\)= /, '');
  };

  const sessionDir = (sessionId: string): string => join(quarantineRoot, 'quarantine', sessionId);

  const DENY_FRAGMENTS = [
    '/.git/',
    '/.ssh/',
    '/.env',
    '/id_rsa',
    '/.vscode/',
    'tasks.json',
    '/secrets/',
    '/keys/',
    'keys/',
  ];

  const isDeniedPath = (relativePath: string): boolean => {
    const normalized = relativePath.replace(/\\/g, '/');
    return DENY_FRAGMENTS.some((frag) => normalized.includes(frag));
  };

  const scanArtifacts = async (sessionId: string): Promise<QuarantineArtifact[]> => {
    const dir = sessionDir(sessionId);
    const artifacts: QuarantineArtifact[] = [];
    const walk = async (currentDir: string, prefix: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(fullPath, rel);
        } else {
          const digest = sha1(fullPath);
          artifacts.push({ sessionId, relativePath: rel, digest, absPath: fullPath });
        }
      }
    };
    await walk(dir, '');
    return artifacts;
  };

  return {
    async stageArtifact(sessionId: string, relativePath: string, content: Buffer): Promise<QuarantineArtifact> {
      if (relativePath.includes('..')) {
        emitRiskEvent('quarantine_traversal_attempt', { sessionId, relativePath });
        throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
      }

      const dir = sessionDir(sessionId);
      const absPath = join(dir, relativePath);
      await mkdir(pathDir(absPath), { recursive: true });
      await writeFile(absPath, content);
      const digest = sha1(absPath);
      return { sessionId, relativePath, digest, absPath };
    },

    async promote(sessionId: string, filePaths: string[]): Promise<void> {
      const dir = sessionDir(sessionId);

      // Resolve the staged digest for each file so we can verify integrity
      // before the file leaves quarantine. Failure to reconcile means the
      // live bytes no longer match what was staged — promotion is denied.
      const pending = new Map<string, QuarantineArtifact>();
      for (const a of await scanArtifacts(sessionId)) {
        pending.set(a.relativePath, a);
      }

      for (const relativePath of filePaths) {
        if (relativePath.includes('..')) {
          emitRiskEvent('quarantine_traversal_attempt', { sessionId, relativePath });
          throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
        }

        const sourcePath = join(dir, relativePath);
        if (!(await stat(sourcePath).catch(() => null))) {
          throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
        }

        const liveDigest = sha1(sourcePath);
        const staged = pending.get(relativePath);
        if (!staged) {
          throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
        }

        if (staged.digest !== liveDigest) {
          emitRiskEvent('promotion_integrity_fail', { sessionId, relativePath, stagedDigest: staged.digest, liveDigest });
          throw new Error(`Promotion denied: integrity failure on ${relativePath}`);
        }

        if (isDeniedPath(relativePath)) {
          emitRiskEvent('promotion_denied_denylist', { sessionId, relativePath });
          throw new Error(`Promotion denied for denylisted path: ${relativePath}`);
        }

        const destPath = join(liveRoot, relativePath);
        await mkdir(pathDir(destPath), { recursive: true });
        const content = await readFile(sourcePath);
        await writeFile(destPath, content, { mode: 0o644 });
        await rm(sourcePath, { recursive: true, force: true }).catch(() => {});
      }

      emitRiskEvent('promotion_success', { sessionId, filesPromoted: filePaths.length });
    },

    async reject(sessionId: string): Promise<void> {
      const dir = sessionDir(sessionId);
      try {
        await rm(dir, { recursive: true, force: true });
        emitRiskEvent('promotion_rejected', { sessionId });
      } catch (error) {
        emitRiskEvent('promotion_rejection_failed', { sessionId, error: String(error) });
      }
    },

    async getPendingArtifacts(sessionId: string): Promise<QuarantineArtifact[]> {
      return scanArtifacts(sessionId);
    },
  };
}

export function createQuarantinePromotionManager(
  quarantineRoot: string,
  liveRoot: string,
  emitRiskEvent: (event: string, payload: Record<string, unknown>) => void = () => {},
): IPromotionManager {
  return buildLocalAdapter(quarantineRoot, liveRoot, emitRiskEvent);
}
