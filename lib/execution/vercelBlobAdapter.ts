/**
 * Vercel Blob-backed quarantine storage adapter.
 *
 * Activated when QUARANTINE_STORAGE=vercel_blob.
 * Keeps artifacts durable across serverless invocations.
 */

import { put, del, list } from '@vercel/blob';
import { join } from 'path';
import type { IPromotionManager, QuarantineArtifact } from './sandboxManager';

export function createVercelBlobStorageAdapter(
  quarantineRoot: string,
  liveRoot: string,
  emitRiskEvent: (event: string, payload: Record<string, unknown>) => void,
): IPromotionManager {
  const blobPrefix = (sessionId: string): string =>
    join(quarantineRoot.replace(/\\/g, '/'), 'quarantine', sessionId).replace(/\\/g, '/');

  const sessionBlobName = (sessionId: string, relativePath: string): string =>
    [blobPrefix(sessionId), relativePath.replace(/\\/g, '/')].filter(Boolean).join('/');

  const computeSha1 = async (url: string): Promise<string> => {
    const parsed = new URL(url);
    // Only compute digests for Vercel Blob storage URLs to prevent SSRF via
    // attacker-controlled blob names.
    if (!/\.(vercel-storage|vercel-blob)\.com$/i.test(parsed.hostname)) {
      throw new Error(`SSRF deny: unexpected blob hostname ${parsed.hostname}`);
    }
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const { createHash } = await import('crypto');
    return createHash('sha1').update(buf).digest('hex');
  };

  return {
    async stageArtifact(sessionId: string, relativePath: string, content: Buffer): Promise<QuarantineArtifact> {
      if (relativePath.includes('..')) {
        emitRiskEvent('quarantine_traversal_attempt', { sessionId, relativePath });
        throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
      }

      const blobName = sessionBlobName(sessionId, relativePath);
      const payload = Buffer.from(content.buffer, content.byteOffset, content.byteLength) as unknown as Buffer;
      const { url } = await put(blobName, payload, { access: 'private' });
      const digest = await computeSha1(url);
      return { sessionId, relativePath, digest, absPath: url };
    },

    async promote(sessionId: string, filePaths: string[]): Promise<void> {
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

      const { mkdir, writeFile } = await import('fs/promises');
      const { dirname } = await import('path');

      for (const relativePath of filePaths) {
        if (relativePath.includes('..')) {
          emitRiskEvent('quarantine_traversal_attempt', { sessionId, relativePath });
          throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
        }

        const blobUrl = `${blobPrefix(sessionId)}/${relativePath.replace(/\\/g, '/')}`;
        const exists = await blobExists(blobUrl);
        if (!exists) {
          throw new Error(`Promotion failed: Artifact ${relativePath} not found in quarantine.`);
        }

        const normalized = relativePath.replace(/\\/g, '/');
        if (DENY_FRAGMENTS.some((frag) => normalized.includes(frag))) {
          emitRiskEvent('promotion_denied_denylist', { sessionId, relativePath });
          throw new Error(`Promotion denied for denylisted path: ${relativePath}`);
        }

        const res = await fetch(blobUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        const destPath = join(liveRoot, relativePath);
        await mkdir(dirname(destPath), { recursive: true });
        await writeFile(destPath, buf, { mode: 0o644 });
        await del([blobUrl]);
      }

      emitRiskEvent('promotion_success', { sessionId, filesPromoted: filePaths.length });
    },

    async reject(sessionId: string): Promise<void> {
      const prefix = blobPrefix(sessionId);
      const { blobs } = await list({ prefix });
      const urls = blobs.map((b) => b.url);
      if (urls.length > 0) {
        await del(urls);
      }
      emitRiskEvent('promotion_rejected', { sessionId });
    },

    async getPendingArtifacts(sessionId: string): Promise<QuarantineArtifact[]> {
      const prefix = blobPrefix(sessionId);
      const { blobs } = await list({ prefix });
      const out: QuarantineArtifact[] = [];
      for (const blob of blobs) {
        const rel = blob.pathname.replace(prefix + '/', '');
        const digest = await computeSha1(blob.url);
        out.push({ sessionId, relativePath: rel, digest, absPath: blob.url });
      }
      return out;
    },
  };
}

async function blobExists(blobUrl: string): Promise<boolean> {
  try {
    const res = await fetch(blobUrl, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
