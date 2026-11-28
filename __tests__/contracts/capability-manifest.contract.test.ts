/**
 * Phase 0 (#440 + review) — capability manifest contracts.
 *
 * Pure-function tests: closed status vocabulary, runtime enforcement of
 * connected_verified (negative test for false connection success — the
 * Zapier callback case), input validation against the mode/verification
 * vocabularies, effective-runtime availability derivation, and the
 * prepared-path derivation from the REAL read enforcement (#440 review
 * finding 2).
 */
import {
  buildCapabilityManifest,
  connectionStatus,
  CapabilityManifestError,
  CONNECTION_STATUSES,
  CAPABILITY_STATUSES,
  derivePreparedCapabilityInputs,
} from '@/lib/agents/core/capabilityManifest';
import { createPreparedContextPlanFromMemoryPlan } from '@/lib/context/readEnforcement';

const BASE = {
  workspaceId: null,
  surface: 'web' as const,
  memoryReadEnabled: true,
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

describe('prepared-path derivation uses the real read enforcement — review finding 2 (#440)', () => {
  it('default fast/light plan: researchLimit 0 → web research must NOT be advertised', () => {
    // The user-reproduced overclaim: fast mode falls back to a light plan whose
    // researchLimit is 0 — retrieval performs no research, so the manifest must
    // not advertise it.
    const plan = createPreparedContextPlanFromMemoryPlan({
      retrievalMode: 'light',
      readScopes: ['conversation', 'user'],
      usePreparedContext: true,
      useGraphRecall: false,
      useRecentTaskState: false,
    });
    const inputs = derivePreparedCapabilityInputs({ plan });
    expect(inputs.webResearchEnabled).toBe(false);
    expect(inputs.memoryReadEnabled).toBe(true);
    // End to end: the manifest built from these inputs stays truthful.
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      memoryReadEnabled: inputs.memoryReadEnabled,
      webResearchEnabled: inputs.webResearchEnabled,
    });
    expect(manifest.capabilities.background_web_research).toBe('unavailable');
    expect(manifest.capabilities.long_term_memory).toBe('available');
  });

  it('memoryPlan.usePreparedContext=false blocks historical retrieval → memory must NOT be advertised', () => {
    // The user-reproduced overclaim: a plan with usePreparedContext false makes
    // buildReadEnforcement's effectivelyDisabled true — no memory read happens.
    const plan = createPreparedContextPlanFromMemoryPlan({
      retrievalMode: 'deep',
      readScopes: ['conversation', 'user', 'graph'],
      usePreparedContext: false,
      useGraphRecall: true,
      useRecentTaskState: false,
    });
    const inputs = derivePreparedCapabilityInputs({ plan });
    expect(inputs.memoryReadEnabled).toBe(false);
    expect(inputs.webResearchEnabled).toBe(false);
  });

  it('deep mode with research allowed keeps web research advertised', () => {
    const plan = createPreparedContextPlanFromMemoryPlan({
      retrievalMode: 'deep',
      readScopes: ['conversation', 'user', 'graph'],
      usePreparedContext: true,
      useGraphRecall: true,
      useRecentTaskState: false,
    });
    expect(derivePreparedCapabilityInputs({ plan }).webResearchEnabled).toBe(true);
  });

  it('skipWebResearch kills research regardless of plan limits', () => {
    const plan = createPreparedContextPlanFromMemoryPlan({
      retrievalMode: 'deep',
      readScopes: ['conversation', 'user'],
      usePreparedContext: true,
      useGraphRecall: true,
      useRecentTaskState: false,
    });
    expect(derivePreparedCapabilityInputs({ plan, skipWebResearch: true }).webResearchEnabled).toBe(false);
  });

  it('disableExternalContext kills both prepared-path capabilities', () => {
    const inputs = derivePreparedCapabilityInputs({ disableExternalContext: true });
    expect(inputs.webResearchEnabled).toBe(false);
    expect(inputs.memoryReadEnabled).toBe(false);
  });

  it('graph-only plan: graph recall is an implemented memory read → memory advertised', () => {
    // Review round 4 reproduction: prepareContextBundle permits graph
    // retrieval and includes its context for this plan, so the manifest must
    // not report memory unavailable while graph context reaches the prompt.
    const plan = createPreparedContextPlanFromMemoryPlan({
      retrievalMode: 'deep',
      readScopes: ['graph'],
      usePreparedContext: true,
      useGraphRecall: true,
      useRecentTaskState: false,
    });
    const inputs = derivePreparedCapabilityInputs({ plan });
    expect(inputs.memoryReadEnabled).toBe(true);
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      memoryReadEnabled: inputs.memoryReadEnabled,
      webResearchEnabled: inputs.webResearchEnabled,
    });
    expect(manifest.capabilities.long_term_memory).toBe('available');
  });

  it('graph scope with graph recall disabled → memory NOT advertised', () => {
    const inputs = derivePreparedCapabilityInputs({
      plan: {
        retrievalMode: 'deep',
        readScopes: ['graph'],
        usePreparedContext: true,
        useGraphRecall: false,
        useRecentTaskState: false,
      },
    });
    expect(inputs.memoryReadEnabled).toBe(false);
  });

  it('graph-only plan with usePreparedContext=false → memory NOT advertised', () => {
    const inputs = derivePreparedCapabilityInputs({
      plan: {
        retrievalMode: 'deep',
        readScopes: ['graph'],
        usePreparedContext: false,
        useGraphRecall: true,
        useRecentTaskState: false,
      },
    });
    expect(inputs.memoryReadEnabled).toBe(false);
    expect(inputs.webResearchEnabled).toBe(false);
  });
});

describe('availability derives from effective execution values — review findings 1+2 (#440)', () => {
  it('agentic WITH harness: full tool-backed capabilities', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'agentic', workspaceId: 'ws_1' });
    expect(manifest.capabilities.agentic_harness).toBe('available');
    expect(manifest.capabilities.workspace_discovery).toBe('available');
    expect(manifest.capabilities.connection_discovery).toBe('available');
    expect(manifest.capabilities.workspace_intelligence).toBe('available');
    expect(manifest.capabilities.long_term_memory).toBe('available');
    expect(manifest.capabilities.background_web_research).toBe('available');
    expect(manifest.capabilities.workspace_context).toBe('available');
  });

  it('agentic WITHOUT harness: harness and LOCAL discovery unavailable; server-side source search survives', () => {
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'agentic',
      workspaceId: 'ws_1',
      ioHarnessPresent: false,
    });
    expect(manifest.capabilities.agentic_harness).toBe('unavailable');
    expect(manifest.capabilities.workspace_intelligence).toBe('unavailable');
    expect(manifest.capabilities.long_term_memory).toBe('unavailable');
    // query_workspace_sources guards on workspace/user only, no harness.
    expect(manifest.capabilities.workspace_source_search).toBe('available');
    // web_search is a base-catalog tool — internet access survives.
    expect(manifest.capabilities.background_web_research).toBe('available');
  });

  it('agentic WITHOUT a workspace: explicit-target source search stays available (#443 review)', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'agentic' });
    expect(manifest.capabilities.workspace_source_search).toBe('available');
    expect(manifest.capabilities.workspace_context).toBe('unsupported');
  });

  it('skipWebResearch (enforcement-derived) makes prepared web research unavailable', () => {
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      webResearchEnabled: false,
    });
    expect(manifest.capabilities.background_web_research).toBe('unavailable');
  });

  it('memory-read disabled collapses long-term memory; research follows its own gate', () => {
    const manifest = buildCapabilityManifest({
      ...BASE,
      resolvedMode: 'fast',
      workspaceId: 'ws_1',
      memoryReadEnabled: false,
      webResearchEnabled: true,
    });
    expect(manifest.capabilities.long_term_memory).toBe('unavailable');
    // Research and memory gates are independent enforcement outputs.
    expect(manifest.capabilities.background_web_research).toBe('available');
  });

  it('non-agentic modes mark harness/intelligence/source-search unsupported — not merely unavailable', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'fast', workspaceId: 'ws_1' });
    expect(manifest.capabilities.agentic_harness).toBe('unsupported');
    expect(manifest.capabilities.workspace_intelligence).toBe('unsupported');
    expect(manifest.capabilities.workspace_source_search).toBe('unsupported');
    expect(manifest.capabilities.workspace_discovery).toBe('unsupported');
    expect(manifest.capabilities.connection_discovery).toBe('unsupported');
  });

  it('carries surface and the Weaver identity', () => {
    const manifest = buildCapabilityManifest({ ...BASE, resolvedMode: 'fast' });
    expect(manifest.identity).toBe('weaver');
    expect(manifest.surface).toBe('web');
  });
});
