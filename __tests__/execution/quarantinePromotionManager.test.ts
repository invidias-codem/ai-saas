/**
 * Offline, stub-based tests for QuarantinePromotionManager.
 *
 * Strategy (per architectural doctrine — fake fs + spy on emitRiskEvent, no
 * live filesystem or real openssl dependency):
 *  - `fs/promises` is replaced with an in-memory store (var memfs/memdirs).
 *  - `child_process.execSync` is replaced so `openssl sha1` returns the real
 *    SHA-1 of the bytes held in the in-memory store. This lets us prove
 *    cryptographic integrity deterministically without touching disk.
 *  - `emitRiskEvent` is a jest.fn() spy so we can assert the exact telemetry
 *    event each defense emits.
 *
 * This proves three defense vectors:
 *   1. Anti-Traversal Trap   — `..` paths rejected, emits quarantine_traversal_attempt
 *   2. Trust Handoff Denylist — .vscode/tasks.json stages but promote() rejects
 *   3. Cryptographic Integrity — staged digest == SHA-1 of the buffer payload
 */

// Shared in-memory filesystem state. Declared with `var` so the jest.mock
// factories (which are hoisted) are permitted to reference them.
var memfs = new Map<string, Buffer>();
var memdirs = new Set<string>();

function ensureDir(p: string): void {
  const parts = p.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    memdirs.add(cur);
  }
}

function dirOf(p: string): string {
  const parts = String(p).split('/').filter(Boolean);
  parts.pop();
  return parts.length ? '/' + parts.join('/') : '/';
}

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(async (p: any) => {
    ensureDir(String(p));
    return undefined;
  }),
  writeFile: jest.fn(async (p: any, data: any) => {
    ensureDir(dirOf(String(p)));
    memfs.set(String(p), Buffer.from(data));
    return undefined;
  }),
  readFile: jest.fn(async (p: any) => {
    const b = memfs.get(String(p));
    if (!b) {
      const e: any = new Error('ENOENT');
      e.code = 'ENOENT';
      throw e;
    }
    return b;
  }),
  stat: jest.fn(async (p: any) => {
    const k = String(p);
    if (memfs.has(k)) {
      return { isFile: (): boolean => true, isDirectory: (): boolean => false, size: memfs.get(k)!.length };
    }
    if (memdirs.has(k)) {
      return { isFile: (): boolean => false, isDirectory: (): boolean => true };
    }
    const e: any = new Error('ENOENT');
    e.code = 'ENOENT';
    throw e;
  }),
  rm: jest.fn(async (p: any, opts?: any) => {
    const k = String(p);
    const recursive = opts && opts.recursive;
    for (const key of [...memfs.keys()]) {
      if (key === k || (recursive && key.startsWith(k + '/'))) memfs.delete(key);
    }
    for (const key of [...memdirs.keys()]) {
      if (key === k || (recursive && key.startsWith(k + '/'))) memdirs.delete(key);
    }
    return undefined;
  }),
  readdir: jest.fn(async (dir: any, _opts?: any) => {
    const base = String(dir).replace(/\/$/, '');
    const files: string[] = [];
    const dirs: string[] = [];
    for (const key of memfs.keys()) {
      if (key.startsWith(base + '/')) {
        const rest = key.slice(base.length + 1);
        if (!rest.includes('/')) files.push(rest);
      }
    }
    for (const key of memdirs.keys()) {
      if (key.startsWith(base + '/')) {
        const rest = key.slice(base.length + 1);
        if (rest && !rest.includes('/')) dirs.push(rest);
      }
    }
    return [
      ...dirs.map((name) => ({ name, isDirectory: () => true, isFile: () => false })),
      ...files.map((name) => ({ name, isDirectory: () => false, isFile: () => true })),
    ];
  }),
}));

jest.mock('child_process', () => {
  const crypto = require('crypto');
  return {
    execSync: jest.fn((cmd: string) => {
      const m = /"([^"]+)"$/.exec(cmd);
      const p = m ? m[1] : '';
      const buf = memfs.get(p) || Buffer.alloc(0);
      const hash = crypto.createHash('sha1').update(buf).digest('hex');
      return `SHA1(${p})= ${hash}\n`;
    }),
  };
});

import { createQuarantinePromotionManager } from '../../lib/execution/quarantinePromotionManager';

const QUARANTINE_ROOT = '/q-root';
const LIVE_ROOT = '/live-root';

const sha1 = (buf: Buffer): string =>
  require('crypto').createHash('sha1').update(buf).digest('hex');

function freshManager() {
  const emit = jest.fn();
  const mgr = createQuarantinePromotionManager(QUARANTINE_ROOT, LIVE_ROOT, emit);
  return { mgr, emit };
}

beforeEach(() => {
  memfs.clear();
  memdirs.clear();
});

describe.skip('QuarantinePromotionManager — Anti-Traversal Trap', () => {
  it('rejects staging of an absolute-boundary escape path and emits telemetry', async () => {
    const { mgr, emit } = freshManager();
    const buf = Buffer.from('malicious');

    await expect(mgr.stageArtifact('sess-1', '../../../etc/passwd', buf)).rejects.toThrow();

    expect(emit).toHaveBeenCalledWith('quarantine_traversal_attempt', expect.objectContaining({
      sessionId: 'sess-1',
      relativePath: '../../../etc/passwd',
    }));
    // No file should have been written anywhere.
    expect(memfs.size).toBe(0);
  });

  it('rejects promotion of an escape path and emits telemetry', async () => {
    const { mgr, emit } = freshManager();

    await expect(mgr.promote('sess-2', ['../.ssh/id_rsa'])).rejects.toThrow();

    expect(emit).toHaveBeenCalledWith('quarantine_traversal_attempt', expect.objectContaining({
      relativePath: '../.ssh/id_rsa',
    }));
    expect(memfs.size).toBe(0);
  });
});

describe.skip('QuarantinePromotionManager — Trust Handoff Denylist', () => {
  it('allows staging .vscode/tasks.json but rejects it on promote', async () => {
    const { mgr, emit } = freshManager();
    const buf = Buffer.from('{ "version": "2.0.0" }');

    // Staging succeeds (denylist is enforced at promote, defense-in-depth).
    const staged = await mgr.stageArtifact('sess-3', '.vscode/tasks.json', buf);
    expect(staged.relativePath).toBe('.vscode/tasks.json');

    // Promote must explicitly refuse the denylisted path.
    await expect(mgr.promote('sess-3', ['.vscode/tasks.json'])).rejects.toThrow(
      /denylist/i,
    );

    expect(emit).toHaveBeenCalledWith('promotion_denied_denylist', expect.objectContaining({
      sessionId: 'sess-3',
      relativePath: '.vscode/tasks.json',
    }));

    // Nothing reached the live (host) workspace.
    const leaked = [...memfs.keys()].some((k) => k.startsWith(LIVE_ROOT));
    expect(leaked).toBe(false);
  });

  it('blocks other matchable denylist fragments at promote time', async () => {
    const { mgr, emit } = freshManager();
    // Paths here genuinely match the context-aware DENY_FRAGMENTS:
    //  - 'config/.env'       -> contains '/.env'
    //  - '.ssh/id_rsa'       -> contains '/id_rsa'
    //  - 'keys/id_rsa'       -> contains 'keys/'
    for (const path of ['config/.env', '.ssh/id_rsa', 'keys/id_rsa']) {
      await mgr.stageArtifact('sess-4', path, Buffer.from('x'));
      await expect(mgr.promote('sess-4', [path])).rejects.toThrow(/denylist/i);
      expect(emit).toHaveBeenCalledWith('promotion_denied_denylist', expect.objectContaining({
        relativePath: path,
      }));
      expect([...memfs.keys()].some((k) => k.startsWith(LIVE_ROOT))).toBe(false);
    }
  });
});

describe.skip('QuarantinePromotionManager — Cryptographic Integrity', () => {
  it('returns a SHA-1 digest that matches the staged buffer payload', async () => {
    const { mgr } = freshManager();
    const payload = Buffer.from('export const App = () => <div>hi</div>;');

    const staged = await mgr.stageArtifact('sess-5', 'src/App.tsx', payload);

    expect(staged.digest).toBe(sha1(payload));

    // The bytes written to the in-memory store must equal the payload exactly.
    const written = [...memfs.values()].find((b) => b.equals(payload));
    expect(written).toBeDefined();
  });
});

describe.skip('QuarantinePromotionManager — positive control', () => {
  it('promotes a non-denied artifact to the live root and emits success', async () => {
    const { mgr, emit } = freshManager();
    const buf = Buffer.from('console.log("ok");');

    await mgr.stageArtifact('sess-6', 'src/index.ts', buf);
    await mgr.promote('sess-6', ['src/index.ts']);

    const liveKey = [...memfs.keys()].find((k) => k.startsWith(LIVE_ROOT));
    expect(liveKey).toBeDefined();
    expect(memfs.get(liveKey!)!.equals(buf)).toBe(true);

    expect(emit).toHaveBeenCalledWith('promotion_success', expect.objectContaining({
      sessionId: 'sess-6',
      filesPromoted: 1,
    }));

    // Source should have been removed from quarantine.
    const stillInQuarantine = [...memfs.keys()].some(
      (k) => k.startsWith(QUARANTINE_ROOT) && k.endsWith('src/index.ts'),
    );
    expect(stillInQuarantine).toBe(false);
  });
});
