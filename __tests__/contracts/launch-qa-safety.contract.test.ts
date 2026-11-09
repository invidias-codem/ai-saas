import {
  assertCaptureConsent, LAUNCH_VIEWPORTS, normalizeLaunchUrl,
} from '@/lib/launch/qaSafety';

describe('Product Hunt launch QA security and consent', () => {
  const baseline = {
    captureBuilder: false, runBuild: false, storageState: undefined,
    syntheticOnly: false, creditUseApproved: false,
  };
  it('covers four target browser widths', () => {
    expect(LAUNCH_VIEWPORTS.map(v => v.width)).toEqual([320, 375, 390, 1440]);
  });
  it('normalizes safe URLs to the launch route', () => {
    expect(normalizeLaunchUrl('https://preview.example.vercel.app'))
      .toBe('https://preview.example.vercel.app/en/launch');
    expect(normalizeLaunchUrl('https://preview.example.vercel.app/en/launch'))
      .toBe('https://preview.example.vercel.app/en/launch');
    expect(normalizeLaunchUrl('http://127.0.0.1:3000'))
      .toBe('http://127.0.0.1:3000/en/launch');
  });
  it.each([
    'http://example.com', 'https://user:password@example.com',
    'https://example.com/secret', 'https://example.com/en/launch?auth=private',
    'https://example.com/#bypass', 'file:///private/data',
  ])('rejects unsafe URL %s', url => {
    expect(() => normalizeLaunchUrl(url)).toThrow();
  });
  it('allows anonymous public page checks with no secrets', () => {
    expect(() => assertCaptureConsent(baseline)).not.toThrow();
  });
  it('does not permit unauthenticated or real-data screenshots', () => {
    expect(() => assertCaptureConsent({ ...baseline, captureBuilder: true }))
      .toThrow('synthetic-only');
    expect(() => assertCaptureConsent({
      ...baseline, captureBuilder: true,
      storageState: '/private/test.json', syntheticOnly: true,
    })).not.toThrow();
  });
  it('prevents charging credits without separate positive authorization', () => {
    expect(() => assertCaptureConsent({ ...baseline, runBuild: true }))
      .toThrow('--capture-builder');
    expect(() => assertCaptureConsent({
      ...baseline, captureBuilder: true, runBuild: true,
      storageState: '/private/test.json', syntheticOnly: true,
    })).toThrow('consume credits');
    expect(() => assertCaptureConsent({
      ...baseline, captureBuilder: true, runBuild: true,
      storageState: '/private/test.json', syntheticOnly: true,
      creditUseApproved: true,
    })).not.toThrow();
  });
});
