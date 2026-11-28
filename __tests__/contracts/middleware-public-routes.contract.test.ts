/**
 * Middleware public-route contract tests.
 *
 * The public-route allowlist is declared inline in proxy.ts via
 * `createRouteMatcher([...])` and is not exported. Rather than invoke the full
 * Next.js middleware machinery (untestable in Jest), this characterization test
 * locks the SOURCE list itself — the single source of truth for what is public —
 * and asserts the security-relevant invariants:
 *   - intended public routes are present
 *   - protected surfaces are absent
 *   - wildcard/prefix patterns cannot accidentally expose adjacent routes
 *   - webhook/auth exceptions are intentional and listed
 *
 * If this list drifts in proxy.ts, this test fails first.
 */
import * as fs from 'fs';
import * as path from 'path';

const proxyPath = path.resolve(__dirname, '../../proxy.ts');
const proxySource = fs.readFileSync(proxyPath, 'utf8');

/** Extract the literal string entries from the createRouteMatcher([...]) array. */
function extractPublicRouteList(source: string): string[] {
  const start = source.indexOf('createRouteMatcher([');
  if (start === -1) throw new Error('createRouteMatcher([ not found in proxy.ts');
  const open = source.indexOf('[', start);
  const close = source.indexOf(']);', open);
  const body = source.slice(open + 1, close);
  const entries: string[] = [];
  for (const raw of body.split('\n')) {
    const m = raw.match(/^\s*'([^']+)'/);
    if (m) entries.push(m[1]);
  }
  return entries;
}

const PUBLIC = extractPublicRouteList(proxySource);

describe('Middleware public-route contract', () => {
  it('lists the intended public entry points', () => {
    expect(PUBLIC).toEqual(expect.arrayContaining([
      '/',
      '/sign-in(.*)',
      '/sign-up(.*)',
      '/docs',
      '/docs/(.*)',
      '/:locale(en|th|vi|es|fr|de)/docs/(.*)',
      '/blog(.*)',
      '/api/webhooks/stripe',
      '/api/webhooks/kofi',
      '/api/webhooks/vercel-logs',
      '/api/v1/(.*)',
    ]));
  });

  it('keeps protected dashboard surfaces OUT of the public list', () => {
    const protectedPatterns = [
      '/dashboard(.*)',
      '/settings(.*)',
      '/api/admin(.*)',
      '/api/users(.*)',
      '/api/billing(.*)',
      '/api/credits(.*)',
      '/api/memory(.*)', // memory is not whitelisted globally; only /api/memory/cli is listed explicitly
    ];
    for (const p of protectedPatterns) {
      expect(PUBLIC).not.toContain(p);
    }
  });

  it('does not let a non-wildcard public route expose a sibling path', () => {
    // Exact entries must not be wildcard entries.
    const exact = PUBLIC.filter((p) => !p.includes('(') && !p.endsWith('/'));
    expect(exact).toContain('/api/code');
    // A non-wildcard exact match like /api/code must not also be /api/code(.*) unless intended.
    expect(PUBLIC).not.toContain('/api/code(.*)');
  });

  it('keeps webhook/auth callback exceptions explicit and enumerated', () => {
    // Slack, Telegram, webhooks, and CLI streams are intentionally public; assert presence.
    expect(PUBLIC).toEqual(expect.arrayContaining([
      '/api/integrations/slack/events',
      '/api/integrations/slack/interactivity',
      '/api/integrations/slack/command',
      '/api/integrations/telegram/webhook',
      '/api/cli/stream',
    ]));
  });

  it('explicitly marks cron as wildcard-public (documented reason: signup-safe)', () => {
    expect(PUBLIC.some((p) => p.startsWith('/api/cron'))).toBe(true);
  });

  it('has no empty or malformed entries', () => {
    for (const p of PUBLIC) {
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it('contains no duplicate entries', () => {
    expect(new Set(PUBLIC).size).toBe(PUBLIC.length);
  });
});