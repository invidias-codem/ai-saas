/**
 * lib/ucol/__tests__/sudoLoader.test.ts
 *
 * Unit tests for the UCOL SudoLoader module.
 * Uses jest.mock to control fs.readFileSync without hitting the filesystem.
 */

import path from 'path';

// ─── Mock fs before importing the module ────────────────────────────────────

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

import fs from 'fs';

// Import after mocking fs so the module picks up our mock
import {
  loadSudoPrompt,
  loadSudoPromptFromPath,
  registerPromptPath,
  clearPromptCache,
  getSudoRegistry,
  SudoLoaderError,
} from '../sudoLoader';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

const FAKE_CONTENT = `TechGenieBlueskyAgent {\n  identity: "Tech Genie"\n}\n`;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

function resolveFromRoot(rel: string): string {
  return path.resolve(PROJECT_ROOT, rel);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  clearPromptCache();
  mockReadFileSync.mockReset();
  // Default: simulate file-not-found for all paths
  mockReadFileSync.mockImplementation(() => {
    throw new Error('ENOENT: no such file or directory');
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loadSudoPrompt — registry resolution', () => {
  it('loads from a registered path when the file exists', async () => {
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === resolveFromRoot('lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md')) {
        return FAKE_CONTENT;
      }
      throw new Error('ENOENT');
    });

    const result = await loadSudoPrompt('tech-genie-bluesky');
    expect(result).toBe(FAKE_CONTENT);
  });

  it('returns empty string (no throw) when file is missing and no fallback', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await loadSudoPrompt('nonexistent-agent');
    expect(result).toBe('');
    consoleSpy.mockRestore();
  });

  it('uses the fallback when file cannot be resolved', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await loadSudoPrompt('nonexistent-agent', {
      fallback: 'FallbackAgent { identity: "fallback" }',
    });
    expect(result).toBe('FallbackAgent { identity: "fallback" }');
    consoleSpy.mockRestore();
  });

  it('throws SudoLoaderError in strict mode when file is missing', async () => {
    await expect(
      loadSudoPrompt('nonexistent-strict', { strict: true })
    ).rejects.toThrow(SudoLoaderError);
  });

  it('throws SudoLoaderError with descriptive message', async () => {
    await expect(
      loadSudoPrompt('nonexistent-strict', { strict: true })
    ).rejects.toThrow(/strict mode is enabled/);
  });
});

describe('loadSudoPrompt — cache behaviour', () => {
  it('caches the result after the first load', async () => {
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === resolveFromRoot('lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md')) {
        return FAKE_CONTENT;
      }
      throw new Error('ENOENT');
    });

    await loadSudoPrompt('tech-genie-bluesky');
    await loadSudoPrompt('tech-genie-bluesky');

    // readFileSync should have been called exactly once (second call served from cache)
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('re-reads the file after the cache entry expires', async () => {
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === resolveFromRoot('lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md')) {
        return FAKE_CONTENT;
      }
      throw new Error('ENOENT');
    });

    // Use a very short TTL (1 ms)
    await loadSudoPrompt('tech-genie-bluesky', { cacheMs: 1 });

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    await loadSudoPrompt('tech-genie-bluesky', { cacheMs: 1 });

    // File should have been read twice (cache expired between calls)
    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });

  it('clearPromptCache() forces a fresh read on the next call', async () => {
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === resolveFromRoot('lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md')) {
        return FAKE_CONTENT;
      }
      throw new Error('ENOENT');
    });

    await loadSudoPrompt('tech-genie-bluesky');
    clearPromptCache();
    await loadSudoPrompt('tech-genie-bluesky');

    expect(mockReadFileSync).toHaveBeenCalledTimes(2);
  });
});

describe('loadSudoPrompt — convention-based paths', () => {
  it('falls back to the UCOL convention path when registry path fails', async () => {
    const ucolPath = resolveFromRoot(
      'lib/ucol/agents/prompts/error-classifier.sudo.md'
    );

    mockReadFileSync.mockImplementation((p) => {
      // Registered path (same as ucol convention here) — return content
      if (String(p) === ucolPath) return FAKE_CONTENT;
      throw new Error('ENOENT');
    });

    const result = await loadSudoPrompt('error-classifier');
    expect(result).toBe(FAKE_CONTENT);
  });

  it('falls back to the agent-local path when both registry and convention fail', async () => {
    // Register a fake name with no registered path so registry miss is guaranteed
    registerPromptPath('my-custom-agent', 'lib/nonexistent/path/does-not-exist.sudo.md');

    const agentLocalPath = resolveFromRoot(
      'lib/agents/my-custom-agent/prompts/my-custom-agent.sudo.md'
    );

    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === agentLocalPath) return FAKE_CONTENT;
      throw new Error('ENOENT');
    });

    const result = await loadSudoPrompt('my-custom-agent');
    expect(result).toBe(FAKE_CONTENT);
  });
});

describe('loadSudoPromptFromPath', () => {
  it('loads content from an explicit absolute path', async () => {
    const absPath = '/tmp/fake-prompt.sudo.md';
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === absPath) return FAKE_CONTENT;
      throw new Error('ENOENT');
    });

    const result = await loadSudoPromptFromPath(absPath);
    expect(result).toBe(FAKE_CONTENT);
  });

  it('loads content from a relative path (resolved from project root)', async () => {
    const relPath = 'lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md';
    const absPath = resolveFromRoot(relPath);

    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === absPath) return FAKE_CONTENT;
      throw new Error('ENOENT');
    });

    const result = await loadSudoPromptFromPath(relPath);
    expect(result).toBe(FAKE_CONTENT);
  });

  it('caches by resolved path key', async () => {
    const absPath = '/tmp/cached-prompt.sudo.md';
    mockReadFileSync.mockImplementation((p) => {
      if (String(p) === absPath) return FAKE_CONTENT;
      throw new Error('ENOENT');
    });

    await loadSudoPromptFromPath(absPath);
    await loadSudoPromptFromPath(absPath);

    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('uses fallback when path cannot be read', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await loadSudoPromptFromPath('/no/such/file.sudo.md', {
      fallback: 'inline fallback content',
    });
    expect(result).toBe('inline fallback content');
    consoleSpy.mockRestore();
  });

  it('throws SudoLoaderError in strict mode', async () => {
    await expect(
      loadSudoPromptFromPath('/no/such/file.sudo.md', { strict: true })
    ).rejects.toThrow(SudoLoaderError);
  });
});

describe('getSudoRegistry', () => {
  it('returns the registered name→path mapping', () => {
    const registry = getSudoRegistry();

    // Pre-registered prompts (module init)
    expect(registry['tech-genie-bluesky']).toBe(
      'lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md'
    );
    expect(registry['error-classifier']).toBe(
      'lib/ucol/agents/prompts/error-classifier.sudo.md'
    );
    expect(registry['knowledge-extractor']).toBe(
      'lib/ucol/agents/prompts/knowledge-extractor.sudo.md'
    );
    expect(registry['agent-router']).toBe(
      'lib/ucol/agents/prompts/agent-router.sudo.md'
    );
  });

  it('returns a snapshot (not a live reference)', () => {
    const snapshot1 = getSudoRegistry();
    registerPromptPath('transient-test', 'lib/ucol/agents/prompts/transient.sudo.md');
    const snapshot2 = getSudoRegistry();

    // snapshot1 was captured before the new registration
    expect(snapshot1['transient-test']).toBeUndefined();
    expect(snapshot2['transient-test']).toBe(
      'lib/ucol/agents/prompts/transient.sudo.md'
    );
  });
});
