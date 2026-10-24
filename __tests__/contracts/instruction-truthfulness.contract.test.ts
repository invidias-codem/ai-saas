/**
 * Phase 0 (#440) — instruction truthfulness contracts.
 *
 * The system instruction is derived from the per-request capability manifest.
 * The removed unconditional directives must stay gone; capability claims must
 * match the manifest; Weaver is the identity with explicit Genie compatibility.
 */
import { buildCapabilityManifest, buildWeaverSystemInstruction } from '@/lib/agents/core/capabilityManifest';

const FULL = {
  resolvedMode: 'agentic',
  workspaceId: 'ws_1',
  backgroundWebResearchEnabled: true,
  longTermMemoryEnabled: true,
} as const;

const OFF = {
  resolvedMode: 'fast',
  workspaceId: null,
  backgroundWebResearchEnabled: false,
  longTermMemoryEnabled: false,
} as const;

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
    expect(off).not.toContain('Web research: available.');
  });

  it('claims memory only when available', () => {
    const on = buildWeaverSystemInstruction(buildCapabilityManifest(FULL));
    expect(on).toContain('Long-term memory: available');
    const off = buildWeaverSystemInstruction(buildCapabilityManifest(OFF));
    expect(off).toContain('Long-term memory: unavailable in this session');
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

  it('never claims capabilities outside the manifest (rendered text derives from statuses)', () => {
    const text = buildWeaverSystemInstruction(buildCapabilityManifest(OFF));
    expect(text).toContain('not supported in this session');
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
