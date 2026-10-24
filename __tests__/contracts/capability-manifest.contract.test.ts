/**
 * Phase 0 (#440) — capability manifest contracts.
 *
 * Pure-function tests: closed status vocabulary, runtime enforcement of
 * connected_verified (negative test for false connection success — the
 * Zapier callback case), and typed failure on invalid resolved mode.
 */
import {
  buildCapabilityManifest,
  connectionStatus,
  CapabilityManifestError,
  CONNECTION_STATUSES,
  CAPABILITY_STATUSES,
} from '@/lib/agents/core/capabilityManifest';

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

  it('an incomplete verification record is a typed failure, not a silent downgrade', () => {
    expect(() =>
      connectionStatus({
        label: 'github',
        provider: 'github',
        hasPersistedCredential: true,
        verification: { method: '', checkedAt: '' },
      }),
    ).toThrow(CapabilityManifestError);
  });
});

describe('manifest resolution failures are typed, never silent (#440)', () => {
  const base = { workspaceId: null, backgroundWebResearchEnabled: false, longTermMemoryEnabled: true };

  it('throws CapabilityManifestError on missing resolved mode', () => {
    expect(() => buildCapabilityManifest({ ...base, resolvedMode: undefined })).toThrow(
      CapabilityManifestError,
    );
  });

  it('throws on empty resolved mode', () => {
    expect(() => buildCapabilityManifest({ ...base, resolvedMode: '' })).toThrow(
      CapabilityManifestError,
    );
  });

  it('surfaces the INVALID_RESOLVED_MODE code', () => {
    try {
      buildCapabilityManifest({ ...base, resolvedMode: null });
      throw new Error('expected CapabilityManifestError');
    } catch (e) {
      expect(e).toBeInstanceOf(CapabilityManifestError);
      expect((e as CapabilityManifestError).code).toBe('INVALID_RESOLVED_MODE');
    }
  });
});

describe('capability statuses reflect the resolved runtime (#440)', () => {
  it('agentic mode marks harness and intelligence available', () => {
    const manifest = buildCapabilityManifest({
      resolvedMode: 'agentic',
      workspaceId: 'ws_1',
      backgroundWebResearchEnabled: true,
      longTermMemoryEnabled: true,
    });
    expect(manifest.capabilities.agentic_harness).toBe('available');
    expect(manifest.capabilities.workspace_intelligence).toBe('available');
    expect(manifest.capabilities.workspace_context).toBe('available');
  });

  it('non-agentic modes mark harness/intelligence unsupported — not merely unavailable', () => {
    const manifest = buildCapabilityManifest({
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      backgroundWebResearchEnabled: true,
      longTermMemoryEnabled: true,
    });
    expect(manifest.capabilities.agentic_harness).toBe('unsupported');
    expect(manifest.capabilities.workspace_intelligence).toBe('unsupported');
  });

  it('no workspace → workspace_context unsupported', () => {
    const manifest = buildCapabilityManifest({
      resolvedMode: 'agentic',
      workspaceId: null,
      backgroundWebResearchEnabled: true,
      longTermMemoryEnabled: true,
    });
    expect(manifest.capabilities.workspace_context).toBe('unsupported');
  });

  it('runtime-supported but switched-off capabilities are unavailable, not unsupported', () => {
    const manifest = buildCapabilityManifest({
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      backgroundWebResearchEnabled: false,
      longTermMemoryEnabled: false,
    });
    expect(manifest.capabilities.background_web_research).toBe('unavailable');
    expect(manifest.capabilities.long_term_memory).toBe('unavailable');
  });

  it('carries the Weaver identity', () => {
    const manifest = buildCapabilityManifest({
      resolvedMode: 'fast',
      workspaceId: null,
      backgroundWebResearchEnabled: false,
      longTermMemoryEnabled: true,
    });
    expect(manifest.identity).toBe('weaver');
  });
});
