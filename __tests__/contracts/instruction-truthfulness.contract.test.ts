/**
 * Phase 0 (#440 + review) — instruction truthfulness contracts.
 *
 * The system instruction is derived from the per-request capability manifest.
 * The removed unconditional directives must stay gone; capability claims must
 * match the manifest; unknown/unavailable/unsupported must render distinctly;
 * Weaver is the identity with explicit Genie compatibility.
 */
import {
  buildCapabilityManifest,
  buildWeaverSystemInstruction,
  type CapabilityManifest,
} from '@/lib/agents/core/capabilityManifest';

const FULL = {
  resolvedMode: 'agentic',
  workspaceId: 'ws_1',
  surface: 'web' as const,
  preparedContextEnabled: true,
  webResearchEnabled: true,
  ioHarnessPresent: true,
};

const OFF = {
  resolvedMode: 'fast',
  workspaceId: null,
  surface: 'web' as const,
  preparedContextEnabled: false,
  webResearchEnabled: false,
  ioHarnessPresent: false,
};

describe('removed unconditional-capability directives stay removed (#440)', () => {
  it.each([
    ['full capability', FULL],
    ['minimal capability', OFF],
  ])('%s manifest: no forced claims, no Genie identity', (_label, input) => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(input));
    expect(text).not.toContain('Never deny these capabilities');
    expect(text).not.toContain('speak authoritatively as if you fetched it yourself');
    expect(text).not.toContain('You DO have real-time internet access');
    expect(text).not.toContain("You are 'Genie'");
  });
});

describe('capability claims match the manifest (#440)', () => {
  it('claims web research only when available', () => {
    const on = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(on).toContain('Web research: available');
    const off = buildWeaverSystemInstruction(buildCapabilityManifest(OFF));
    expect(off).toContain('Web research: not available in this session');
    expect(off).not.toContain('Web research: available');
  });

  it('claims memory only when available', () => {
    const on = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(on).toContain('Long-term memory: available');
    const off = buildWeaverSystemInstruction(buildCapabilityManifest(OFF));
    expect(off).toContain('Long-term memory: not available in this session');
    expect(off).not.toContain('Long-term memory: available');
  });

  it('renders unsupported workspace context honestly', () => {
    expect(buildWeaverSystemInstruction(buildCapabilityManifest(OFF))).toContain(
      'no workspace is selected for this conversation',
    );
    expect(buildWeaverSystemInstruction(buildCapabilityManifest(FULL))).toContain(
      'a workspace is selected for this conversation',
    );
  });

  it('unsupported runtime capabilities use the unsupported wording', () => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(OFF));
    expect(text).toContain('Agentic tool use: not supported in this runtime mode');
  });
});

describe('status distinctions survive rendering — review finding 3 (#440)', () => {
  // Hand-built manifest exercising every status on a distinct capability:
  // unknown web access, unavailable memory, unsupported workspace context.
  const mixed: CapabilityManifest = {
    identity: 'weaver',
    surface: 'web',
    resolvedMode: 'agentic',
    workspaceId: null,
    capabilities: {
      background_web_research: 'unknown',
      long_term_memory: 'unavailable',
      workspace_context: 'unsupported',
      agentic_harness: 'available',
      workspace_intelligence: 'unknown',
    },
    connections: [],
  };

  it('unknown renders as unverified availability, not as "not available"', () => {
    const text = buildWeaverSystemInstruction(mixed);
    expect(text).toContain('Web research: availability unverified for this session');
    expect(text).not.toContain('Web research: not available in this session');
    expect(text).toContain('Workspace intelligence: availability unverified for this session');
  });

  it('unavailable renders as switched-off, not as unsupported', () => {
    const text = buildWeaverSystemInstruction(mixed);
    expect(text).toContain('Long-term memory: not available in this session');
    expect(text).not.toContain('Long-term memory: not supported in this runtime mode');
  });

  it('unsupported keeps its own wording, never the unavailable one', () => {
    const text = buildWeaverSystemInstruction(mixed);
    expect(text).toContain('no workspace is selected for this conversation');
    expect(text).not.toContain('Workspace context: not available in this session');
  });
});

describe('identity and truthful self-description (#440)', () => {
  it('uses the Weaver identity with explicit Genie compatibility', () => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(text).toContain('You are Weaver');
    expect(text).toContain('Genie');
    expect(text).toContain('former name for the same assistant');
  });

  it('forbids stateless self-description', () => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(text).toContain('Never describe yourself as a stateless model');
  });

  it('an interaction count is never retrieved history', () => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(text).toContain('A count of past interactions is not retrieved history');
  });

  it('connection vocabulary forbids reporting unverified as connected', () => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(text).toContain('is "unverified" — never "connected"');
  });
});
