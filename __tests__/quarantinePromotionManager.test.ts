import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

import { createQuarantinePromotionManager } from '@/lib/execution/quarantinePromotionManager';
import type { IPromotionManager, QuarantineArtifact } from '@/lib/execution/sandboxManager';

// ---------------------------------------------------------------------------
// Lightweight local event recorder to assert telemetry contract without
// importing the full ALE adapter.
// ---------------------------------------------------------------------------
const events: { event: string; payload: Record<string, unknown> }[] = [];
const emitRiskEvent = (event: string, payload: Record<string, unknown>): void => {
  events.push({ event, payload });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('QuarantinePromotionManager', () => {
  let quarantineRoot: string;
  let liveRoot: string;
  let sessionId: string;
  let manager: IPromotionManager;

  beforeEach(async () => {
    events.length = 0;
    quarantineRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qm-quarantine-'));
    liveRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'qm-live-'));
    sessionId = `sess-${Date.now().toString(36)}`;
    manager = createQuarantinePromotionManager(quarantineRoot, liveRoot, emitRiskEvent);
  });

  afterEach(async () => {
    await fs.rm(quarantineRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(liveRoot, { recursive: true, force: true }).catch(() => {});
  });

  // -----------------------------------------------------------------------
  // Vector 1: Anti-Traversal Trap
  // -----------------------------------------------------------------------
  describe('Anti-Traversal Trap', () => {
    const traversalCases = [
      '../../../etc/passwd',
      '../.ssh/id_rsa',
      '../.env',
      'sub/../../etc/shadow',
      'foo/../../../bar/baz',
    ];

    test.each(traversalCases)(
      'rejects traversal path: %s',
      async (relativePath) => {
        await expect(
          manager.stageArtifact(sessionId, relativePath, Buffer.from('payload')),
        ).rejects.toThrow('not found in quarantine');

        const traversalEvents = events.filter((e) => e.event === 'quarantine_traversal_attempt');
        expect(traversalEvents.length).toBe(1);
        expect(traversalEvents[0].payload).toMatchObject({
          sessionId,
          relativePath,
        });
      },
    );

    test('promote() also rejects traversal path even if file was staged by another vector', async () => {
      // Create a file outside quarantine via raw write, then attempt promote with traversal
      const outsidePath = path.join(quarantineRoot, 'escaped.txt');
      await fs.mkdir(path.dirname(outsidePath), { recursive: true });
      await fs.writeFile(outsidePath, Buffer.from('leak'));

      await expect(
        manager.promote(sessionId, ['../escaped.txt']),
      ).rejects.toThrow('not found in quarantine');

      const traversalEvents = events.filter((e) => e.event === 'quarantine_traversal_attempt');
      expect(traversalEvents.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Vector 2: Trust Handoff Denylist
  // -----------------------------------------------------------------------
  describe('Trust Handoff Denylist', () => {
    test('stages .vscode/tasks.json but promote() rejects it', async () => {
      const relativePath = '.vscode/tasks.json';
      const payload = Buffer.from(JSON.stringify({ version: '2.0.0', tasks: [] }));
      const artifact = await manager.stageArtifact(sessionId, relativePath, payload);

      // Stage must succeed — file exists in quarantine
      const stat = await fs.stat(artifact.absPath);
      expect(stat.size).toBe(payload.length);
      expect(await fs.readFile(artifact.absPath, 'utf8')).toBe(payload.toString('utf8'));
      // staging emitted no traversal event
      expect(events.some((e) => e.event === 'quarantine_traversal_attempt')).toBe(false);

      // Promote must reject denylisted path
      await expect(manager.promote(sessionId, [relativePath])).rejects.toThrow(
        'Promotion denied for denylisted path',
      );

      const deniedEvents = events.filter((e) => e.event === 'promotion_denied_denylist');
      expect(deniedEvents.length).toBe(1);
      expect(deniedEvents[0].payload).toMatchObject({
        sessionId,
        relativePath,
      });

      // Live workspace must not contain the file
      const liveFile = path.join(liveRoot, relativePath);
      await expect(fs.access(liveFile)).rejects.toThrow();
    });

    test.each(['.ssh/id_rsa', 'app/.env.production', 'config/tasks.json'])(
      'promote() rejects additional denylisted artifact: %s',
      async (relativePath) => {
        const payload = Buffer.from('denied-payload');
        const artifact = await manager.stageArtifact(sessionId, relativePath, payload);

        await expect(manager.promote(sessionId, [relativePath])).rejects.toThrow(
          'Promotion denied for denylisted path',
        );

        const liveFile = path.join(liveRoot, relativePath);
        await expect(fs.access(liveFile)).rejects.toThrow();
      },
    );
  });

  // -----------------------------------------------------------------------
  // Vector 3: Cryptographic Integrity
  // -----------------------------------------------------------------------
  describe('Cryptographic Integrity', () => {
    test('SHA-1 digest computed at stage matches payload before live workspace write', async () => {
      const payload = Buffer.from('Lattice OS quarantine integrity verification payload');
      const relativePath = 'workspace/artifact.txt';

      const artifact = await manager.stageArtifact(sessionId, relativePath, payload);

      // Promote with correct digest
      const destPath = path.join(liveRoot, relativePath);
      await manager.promote(sessionId, [relativePath]);

      // File landed in live workspace
      const liveContent = await fs.readFile(destPath);
      expect(liveContent.equals(payload)).toBe(true);

      // Live workspace file is readable with expected permissions
      const mode = (await fs.stat(destPath)).mode & 0o777;
      expect(mode).toBe(0o644);
    });

    test('promote() emits promotion_success with filesPromoted count', async () => {
      const payload = Buffer.from('audit-me');
      const relativePath = 'workspace/audit.txt';
      await manager.stageArtifact(sessionId, relativePath, payload);

      await manager.promote(sessionId, [relativePath]);

      const successEvents = events.filter((e) => e.event === 'promotion_success');
      expect(successEvents.length).toBe(1);
      expect(successEvents[0].payload).toMatchObject({
        sessionId,
        filesPromoted: 1,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Rejection lifecycle
  // -----------------------------------------------------------------------
  describe('Reject lifecycle', () => {
    test('reject() removes quarantine session dir and emits telemetry', async () => {
      const dir = path.join(quarantineRoot, 'quarantine', sessionId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'junk.txt'), 'junk');

      await manager.reject(sessionId);

      await expect(fs.access(dir)).rejects.toThrow();

      const rejectedEvents = events.filter((e) => e.event === 'promotion_rejected');
      expect(rejectedEvents.length).toBe(1);
      expect(rejectedEvents[0].payload).toMatchObject({ sessionId });
    });

    test('reject() is idempotent when dir is already absent', async () => {
      await manager.reject(sessionId);

      const failureEvents = events.filter(
        (e) => e.event === 'promotion_rejection_failed',
      );
      expect(failureEvents.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Pending artifacts + operator-rejection hook
  // -----------------------------------------------------------------------
  describe('Pending artifacts and operator rejection', () => {
    test('getPendingArtifacts returns staged artifacts before promotion', async () => {
      const artifact1 = await manager.stageArtifact(sessionId, 'a.txt', Buffer.from('a'));
      const artifact2 = await manager.stageArtifact(sessionId, 'b.txt', Buffer.from('bb'));

      const pending = await manager.getPendingArtifacts(sessionId);

      expect(pending.map((p) => p.relativePath)).toEqual(['a.txt', 'b.txt']);
      expect(pending).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sessionId,
            relativePath: 'a.txt',
            absPath: artifact1.absPath,
          }),
          expect.objectContaining({
            sessionId,
            relativePath: 'b.txt',
            absPath: artifact2.absPath,
          }),
        ]),
      );
    });

    test('getPendingArtifacts is empty after promote()', async () => {
      await manager.stageArtifact(sessionId, 'a.txt', Buffer.from('a'));
      await manager.promote(sessionId, ['a.txt']);

      const pending = await manager.getPendingArtifacts(sessionId);
      expect(pending).toEqual([]);
    });

    test('getPendingArtifacts is empty after reject()', async () => {
      await manager.stageArtifact(sessionId, 'a.txt', Buffer.from('a'));
      await manager.reject(sessionId);

      const pending = await manager.getPendingArtifacts(sessionId);
      expect(pending).toEqual([]);
    });

    test('operator rejection feeds structured feedback and wipes quarantine', async () => {
      const relativePath = '.vscode/tasks.json';
      const payload = Buffer.from(JSON.stringify({ version: '2.0.0', tasks: [] }));
      await manager.stageArtifact(sessionId, relativePath, payload);

      // Operator rejects the staged artifact
      await manager.reject(sessionId);

      const rejectedEvents = events.filter((e) => e.event === 'promotion_rejected');
      expect(rejectedEvents.length).toBe(1);

      const pending = await manager.getPendingArtifacts(sessionId);
      expect(pending).toEqual([]);

      const liveFile = path.join(liveRoot, relativePath);
      await expect(fs.access(liveFile)).rejects.toThrow();
    });
  });
});
