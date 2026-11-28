import { mkdir, rm, readFile, writeFile, stat, readdir, open, rename } from 'fs/promises';
import { join, dirname as pathDir } from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { IPromotionManager, QuarantineArtifact } from './sandboxManager';

function buildLocalAdapter(
  quarantineRoot: string,
  liveRoot: string,
  emitRiskEvent: (event: string, payload: Record<string, unknown>) => void,
): IPromotionManager {
  const sha1 = (filePath: string): string => {
    const raw = execFileSync('openssl', ['sha1', '-hex', filePath], { encoding: 'utf8' }).trim();
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

      // Atomic create-only write: fails immediately if the file already exists,
      // closing the TOCTOU window between existence check and write.
      const fd = await open(absPath, 'wx');
      try {
        await fd.write(content, 0, content.length, 0);
      } finally {
        await fd.close();
      }

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
        const content = await readFile(sourcePath);

        // Write to a temp sibling path first, then atomically rename into place.
        // This prevents partial writes in the live root and guarantees that
        // the quarantine file is only removed after the promoted file exists.
        const tmpSuffix = `.tmp-${randomUUID()}`;
        const tmpDestPath = `${destPath}${tmpSuffix}`;
        await mkdir(pathDir(tmpDestPath), { recursive: true });
        const destFd = await open(tmpDestPath, 'wx');
        try {
          await destFd.write(content, 0, content.length, 0);
        } finally {
          await destFd.close();
        }
        await rename(tmpDestPath, destPath);
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
