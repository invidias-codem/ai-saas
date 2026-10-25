/**
 * Phase 0 (#440 + review) — capability manifest contracts.
 *
 * Pure-function tests: closed status vocabulary, runtime enforcement of
 * connected_verified (negative test for false connection success — the
 * Zapier callback case), input validation against the mode/verification
 * vocabularies, and effective-runtime availability derivation.
 */
import {
  buildCapabilityManifest,
  connectionStatus,
  CapabilityManifestError,
  CONNECTION_STATUSES,
  CAPABILITY_STATUSES,
} from '@/lib/agents/core/capabilityManifest';

const BASE = {
  workspaceId: null,
  surface: 'web' as const,
  preparedContextEnabled: true,
  webResearchEnabled: true,
  ioHarnessPresent: true,
};

describe('status vocabulary (#440)', () => {
  it('carries every documented connection state', () => {
    expect([...CONNECTION_STATUSES]).toEqual(
      expect.arrayContaining([
        'not_connected',
        'authorization_required',
        'expired_reconnect_required',
        'access_denied',
        'provider_unavailable',
        'unverified',
        'connected_verified',
        'no_matching_authorized_results',
      ]),
    );
  });

  it('carries unverified/unknown evidence states and unsupported runtime capabilities', () => {
    expect([...CAPABILITY_STATUSES]).toEqual(
      expect.arrayContaining(['available', 'unavailable', 'unsupported', 'unknown']),
    );
  });
});

describe('false connection success — negative test (#440)', () => {
  it('a persisted credential WITHOUT verification is unverified, never connected (Zapier case)', () => {
    // Mirrors the current Zapier callback: code exchanged, tokens discarded,
    // success returned. A stored credential alone must not read as connected.
    const status = connectionStatus({
      label: 'zapier',
      provider: 'zapier',
      hasPersistedCredential: true,
      verification: null,
    });
    expect(status).toBe('unverified');
    expect(status).not.toBe('connected_verified');
  });

  it('no persisted credential is not_connected', () => {
    expect(
      connectionStatus({ label: 'github', provider: 'github', hasPersistedCredential: false }),
    ).toBe('not_connected');
  });

  it('connected_verified requires a complete verification record', () => {
    expect(
      connectionStatus({
        label: 'github',
        provider: 'github',
        hasPersistedCredential: true,
        verification: { method: 'provider-identity-check', checkedAt: '2026-10-24T00:00:00Z' },
      }),
    ).toBe('connected_verified');
  });
});

describe('input validation — review finding 4 (#440)', () => {
  it('rejects a mode outside the runtime vocabulary', () => {
    expect(() => buildCapabilityManifest({ ...BASE, resolvedMode: 'invented-mode' })).toThrow(
      CapabilityManifestError,
    );
    try {
      buildCapabilityManifest({ ...BASE, resolvedMode: 'invented-mode' });
    } catch (e) {
      expect((e as CapabilityManifestError).code).toBe('INVALID_RESOLVED_MODE');
    }
  });

  it('rejects whitespace-only mode', () => {
    expect(() => buildCapabilityManifest({ ...BASE, resolvedMode: '   ' })).toThrow(
      CapabilityManifestError,
    );
  });

  it('rejects missing/empty/null modes with INVALID_RESOLVED_MODE', () => {
    for (const resolvedMode of [undefined, '', null]) {
      try {
        buildCapabilityManifest({ ...BASE, resolvedMode });
        throw new Error('expected CapabilityManifestError');
      } catch (e) {
        expect(e).toBeInstanceOf(CapabilityManifestError);
        expect((e as CapabilityManifestError).code).toBe('INVALID_RESOLVED_MODE');
      }
    }
  });

  it('accepts a padded valid mode by trimming', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: ' fast ' });
    expect(manifest.resolvedMode).toBe('fast');
  });

  it('rejects verification with an unparseable checkedAt date', () => {
    expect(() =>
      connectionStatus({
        label: 'github',
        provider: 'github',
        hasPersistedCredential: true,
        verification: { method: 'provider-identity-check', checkedAt: 'not-a-date' },
      }),
    ).toThrow(CapabilityManifestError);
    try {
      connectionStatus({
        label: 'github',
        provider: 'github',
        hasPersistedCredential: true,
        verification: { method: 'provider-identity-check', checkedAt: 'not-a-date' },
      });
    } catch (e) {
      expect((e as CapabilityManifestError).code).toBe('INVALID_VERIFICATION');
    }
  });

  it('rejects blank verification method and blank connection labels', () => {
    expect(() =>
      connectionStatus({
        label: 'github',
        provider: 'github',
        hasPersistedCredential: true,
        verification: { method: '   ', checkedAt: '2026-10-24T00:00:00Z' },
      }),
    ).toThrow(CapabilityManifestError);
    expect(() =>
      connectionStatus({ label: '  ', provider: 'github', hasPersistedCredential: false }),
    ).toThrow(CapabilityManifestError);
  });
});

describe('availability derives from effective execution values — review finding 2 (#440)', () => {
  it('agentic WITH harness: full tool-backed capabilities', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'agentic', workspaceId: 'ws_1' });
    expect(manifest.capabilities.agentic_harness).toBe('available');
    expect(manifest.capabilities.workspace_intelligence).toBe('available');
    expect(manifest.capabilities.long_term_memory).toBe('available');
    expect(manifest.capabilities.background_web_research).toBe('available');
    expect(manifest.capabilities.workspace_context).toBe('available');
  });

  it('agentic WITHOUT harness (worker reality): harness tools unavailable, not advertised', () => {
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'agentic',
      workspaceId: 'ws_1',
      ioHarnessPresent: false,
    });
    expect(manifest.capabilities.agentic_harness).toBe('unavailable');
    expect(manifest.capabilities.workspace_intelligence).toBe('unavailable');
    expect(manifest.capabilities.long_term_memory).toBe('unavailable');
    // web_search is a base-catalog tool — internet access survives.
    expect(manifest.capabilities.background_web_research).toBe('available');
  });

  it('skipWebResearch (caller applies the flag) makes prepared web research unavailable', () => {
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      webResearchEnabled: false,
    });
    expect(manifest.capabilities.background_web_research).toBe('unavailable');
  });

  it('disabled prepared context collapses prepared-path capabilities', () => {
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      preparedContextEnabled: false,
      webResearchEnabled: true,
    });
    expect(manifest.capabilities.long_term_memory).toBe('unavailable');
    expect(manifest.capabilities.background_web_research).toBe('unavailable');
  });

  it('non-agentic modes mark harness/intelligence unsupported — not merely unavailable', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'fast', workspaceId: 'ws_1' });
    expect(manifest.capabilities.agentic_harness).toBe('unsupported');
    expect(manifest.capabilities.workspace_intelligence).toBe('unsupported');
  });

  it('no workspace → workspace_context unsupported', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'agentic' });
    expect(manifest.capabilities.workspace_context).toBe('unsupported');
  });

  it('carries surface and the Weaver identity', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'fast' });
    expect(manifest.identity).toBe('weaver');
    expect(manifest.surface).toBe('web');
  });
});
