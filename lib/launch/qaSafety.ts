/** Fail-closed consent and URL validation for Product Hunt acceptance QA. */
export const LAUNCH_VIEWPORTS = [
  { label: '320', width: 320, height: 760 },
  { label: '375', width: 375, height: 812 },
  { label: '390', width: 390, height: 844 },
  { label: '1440', width: 1440, height: 900 },
] as const;

export function normalizeLaunchUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('LAUNCH_QA_BASE_URL must be an absolute URL'); }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new Error('Launch QA requires HTTPS except on localhost');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      !['/', '/en/launch', '/en/launch/'].includes(parsed.pathname)) {
    throw new Error('Launch QA URL must not contain credentials, query strings, or another route');
  }
  return new URL('/en/launch', parsed.origin).toString();
}

export interface CaptureConsent {
  captureBuilder: boolean;
  runBuild: boolean;
  storageState?: string;
  syntheticOnly: boolean;
  creditUseApproved: boolean;
}

export function assertCaptureConsent(c: CaptureConsent): void {
  if (c.runBuild && !c.captureBuilder) {
    throw new Error('Running a build requires explicit --capture-builder');
  }
  if (c.captureBuilder && (!c.storageState || !c.syntheticOnly)) {
    throw new Error('Authenticated capture requires private storage state and a synthetic-only test account');
  }
  if (c.runBuild && !c.creditUseApproved) {
    throw new Error('Builds consume credits; require LATTICE_QA_ALLOW_BUILD_CHARGES=yes');
  }
}
