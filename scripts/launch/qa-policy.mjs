/**
 * Boundaries for Lattice's public launch QA.
 * Reject arbitrary destinations especially when an OIDC token is available.
 */
export const VIEWPORTS = Object.freeze([320, 375, 390, 1440]);
const PREVIEW_HOST = /^ai-saas-[a-z0-9-]+-invidias-codems-projects\.vercel\.app$/;

export function parseTarget(raw, kind = 'launch') {
  if (typeof raw !== 'string' || raw.length > 400)
    throw new Error('Provide a short absolute HTTPS URL');
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash)
    throw new Error('Only HTTPS URLs without credentials, port, query or fragment are allowed');
  const host = url.hostname.toLowerCase();
  const production = host === 'gen1e.xyz';
  const preview = PREVIEW_HOST.test(host);
  if (!production && !preview)
    throw new Error('URL must belong to gen1e.xyz or the Lattice Vercel Preview project');
  const pathname = kind === 'launch' ? '/en/launch'
    : kind === 'builder' ? '/en/code/builder' : null;
  if (!pathname || url.pathname !== pathname) throw new Error('Unexpected target page');
  return Object.freeze({ url: url.toString(), origin: url.origin, path: pathname, production, preview });
}

export function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!['--url', '--out'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--'))
      throw new Error('Usage: node scripts/launch/qa.mjs --url https://.../en/launch [--out launch-qa-artifacts]');
    if (values[key]) throw new Error('Duplicate option');
    values[key] = argv[++i];
  }
  if (!values['--url']) throw new Error('Missing --url');
  return { target: parseTarget(values['--url']), output: values['--out'] || 'launch-qa-artifacts' };
}

export function checkDocumentState(state, width) {
  const failures = [];
  if (!state.main) failures.push('Missing main landmark');
  if (state.h1 !== 1) failures.push('Expected exactly one H1');
  if (!state.skip) failures.push('Missing skip-to-content link');
  if (state.duplicateIds.length) failures.push('Duplicate IDs: ' + state.duplicateIds.join(', '));
  if (state.unlabeled.length) failures.push('Visible interactive controls missing names');
  if (state.scrollWidth > width + 1 || state.bodyScrollWidth > width + 1)
    failures.push('Horizontal page overflow');
  return failures;
}
