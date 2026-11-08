import {
  PREVIEW_INGRESS_CAPABILITY,
  isPreviewOriginPrivate,
  isPreviewSharingSafe,
} from '@/lib/code-builder/previewIngressPolicy';

describe('preview ingress protection (security issue #479)', () => {
  it('does not confuse unlisted sandbox URLs with private ingress', () => {
    expect(PREVIEW_INGRESS_CAPABILITY).toBe('public-sandbox-port');
    expect(isPreviewOriginPrivate()).toBe(false);
  });

  it('cannot activate sharing merely by setting ENABLE_PREVIEW_SHARING=true', () => {
    const saved = process.env.ENABLE_PREVIEW_SHARING;
    try {
      process.env.ENABLE_PREVIEW_SHARING = 'true';
      expect(isPreviewSharingSafe()).toBe(false);
      delete process.env.ENABLE_PREVIEW_SHARING;
      expect(isPreviewSharingSafe()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.ENABLE_PREVIEW_SHARING;
      else process.env.ENABLE_PREVIEW_SHARING = saved;
    }
  });
});
