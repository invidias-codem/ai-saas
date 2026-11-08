import { resolvePreviewAvailability } from '@/lib/code-builder/previewAvailability';

const complete = {
  enabled: true,
  durableExecution: true,
  buildId: '00000000-0000-4000-8000-000000000001',
  phase: 'done' as const,
  hasFiles: true,
  hasError: false,
};

describe('Code Builder isolated preview availability', () => {
  it('allows a completed, saved build in an enabled internal deployment', () => {
    expect(resolvePreviewAvailability(complete)).toEqual({ canLaunch: true, reason: null });
  });
  it('keeps production preview action discoverable while disabled', () => {
    const state = resolvePreviewAvailability({ ...complete, enabled: false });
    expect(state.canLaunch).toBe(false);
    expect(state.reason).toContain('not enabled');
  });
  it('does not provision previews from the legacy streaming path', () => {
    expect(resolvePreviewAvailability({ ...complete, durableExecution: false }).canLaunch).toBe(false);
  });
  it('requires completed durable artifacts', () => {
    expect(resolvePreviewAvailability({ ...complete, buildId: null }).canLaunch).toBe(false);
    expect(resolvePreviewAvailability({ ...complete, hasFiles: false }).canLaunch).toBe(false);
  });
  it('prevents previewing unfinished or failed builds', () => {
    expect(resolvePreviewAvailability({ ...complete, phase: 'coding' }).canLaunch).toBe(false);
    expect(resolvePreviewAvailability({ ...complete, hasError: true }).canLaunch).toBe(false);
  });
});
