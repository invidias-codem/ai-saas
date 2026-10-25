/**
 * Phase 0 (#440) — reported-response regression fixture.
 *
 * Locks the customer-reported response (see the fixture file) as a regression
 * target: the Weaver instruction must contradict each defective claim, and
 * the fixture must retain the excerpt verbatim with attribution left open.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCapabilityManifest, buildWeaverSystemInstruction } from '@/lib/agents/core/capabilityManifest';

const fixture = readFileSync(
  join(__dirname, '..', 'fixtures', 'reported-response-2026-10.fixture.md'),
  'utf8',
);

describe('reported-response regression fixture (#440)', () => {
  it('retains the reported excerpt verbatim', () => {
    expect(fixture).toContain('No, I cannot access other workspaces in your account.');
    expect(fixture).toContain('I am a stateless AI model running within this specific chat session.');
  });

  it('records the open attribution — runtime mode and tool set remain unverified', () => {
    expect(fixture).toContain('remain unverified');
    expect(fixture).toContain('No conversation/request ID was provided');
  });

  it('the Weaver instruction contradicts the stateless claim under a workspace-backed manifest', () => {
    const text = buildWeaverSystemInstruction(
      buildCapabilityManifest({
        resolvedMode: 'fast',
        workspaceId: 'ws_1',
        surface: 'web',
        preparedContextEnabled: true,
        webResearchEnabled: false,
        ioHarnessPresent: false,
      }),
    );
    expect(text).toContain('Never describe yourself as a stateless model');
    expect(text).toContain('a workspace is selected for this conversation');
  });

  it('access reporting is grounded in server-provided states, not self-description', () => {
    const text = buildWeaverSystemInstruction(
      buildCapabilityManifest({
        resolvedMode: 'fast',
        workspaceId: 'ws_1',
        surface: 'web',
        preparedContextEnabled: true,
        webResearchEnabled: false,
        ioHarnessPresent: false,
      }),
    );
    expect(text).toContain('the only source of truth');
    // The instruction only ever describes the SELECTED workspace — it must
    // not assert blanket cross-workspace reach either way.
    expect(text).not.toContain('other workspaces');
  });
});
