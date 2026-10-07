// __tests__/contracts/acquisition-url-resolver.contract.test.ts
// A1 contracts. Definition of done: an arbitrary untrusted URL cannot reach
// private infrastructure, cannot bypass policy through redirects, is
// deterministically classified, share/tracking variants collapse safely,
// and canonicalization is idempotent — with zero provider SDK, scraping,
// or model calls.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertAddressesPublic,
  assertStaticUrlSafety,
  classifySocialUrl,
  resolveUrl,
  type NetworkBoundary,
} from '@/lib/acquisition/routing/urlResolver';
import { evidenceCacheKey } from '@/lib/acquisition/contracts';

/** Deterministic fixture: hostname → addresses; URL → redirect target. */
function fakeNetwork(args: {
  dns?: Record<string, string[]>;
  redirects?: Record<string, string>;
}): NetworkBoundary {
  return {
    resolve: async (h) => {
      if (args.dns?.[h]) return args.dns[h];
      // default: a public address for any unlisted host
      return ['93.184.216.34'];
    },
    nextRedirect: async (u) => args.redirects?.[u] ?? null,
  };
}

const PUBLIC_DNS = { 'example.com': ['93.184.216.34'] };

describe('acquisition URL resolver — A1 contracts', () => {
  it('1: classifies and canonicalizes social URLs with tracking stripped', async () => {
    const r = await resolveUrl('https://www.threads.com/@alice/post/ABC?xmt=tracking', fakeNetwork({}));
    expect(r.ok).toBe(true);
    expect(r.resource?.platform).toBe('threads');
    expect(r.resource?.resourceType).toBe('post');
    expect(r.resource?.externalId).toBe('ABC');
    expect(r.resource?.handle).toBe('alice');
    expect(r.resource?.canonicalUrl).toBe('https://threads.com/@alice/post/ABC');
    expect(evidenceCacheKey(r.resource!)).toBe('social:threads:post:ABC');
  });

  it('2: two share URLs collapse to the same CanonicalResource + cache key', async () => {
    const a = await resolveUrl('https://threads.com/@a/post/ABC?xmt=1', fakeNetwork({}));
    const b = await resolveUrl('https://www.threads.com/@a/post/ABC?share_url=xyz&utm_source=x', fakeNetwork({}));
    expect(a.ok && b.ok).toBe(true);
    expect(evidenceCacheKey(a.resource!)).toBe(evidenceCacheKey(b.resource!));
    expect(a.resource!.canonicalUrl).toBe(b.resource!.canonicalUrl);
  });

  it('3: query params are NEVER stripped globally — unknown web keeps identity', async () => {
    const r = await resolveUrl('https://example.com/shop?id=84722', fakeNetwork({ dns: PUBLIC_DNS }));
    expect(r.ok).toBe(true);
    expect(r.resource?.platform).toBe('web');
    expect(r.resource?.resourceType).toBe('unknown');
    expect(r.resource?.canonicalUrl).toContain('id=84722'); // preserved
  });

  it('4: static SSRF rejections — loopback, private, link-local, metadata, creds, protocol', async () => {
    for (const bad of [
      'http://127.0.0.1/',
      'http://localhost/',
      'http://10.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/',
      'http://[::ffff:10.0.0.1]/',
      'ftp://example.com/file',
      'https://user:pass@example.com/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'not a url at all',
    ]) {
      const r = await resolveUrl(bad, fakeNetwork({}));
      expect(r.ok).toBe(false);
      expect(['unsafe_url', 'invalid_url']).toContain(r.failure);
    }
  });

  it('5: resolved-address gate — private A/AAAA answers block, IPv4-mapped unwrapped', () => {
    expect(assertAddressesPublic(['93.184.216.34'])).toBeNull();
    expect(assertAddressesPublic(['8.8.8.8', '10.0.0.5'])).toBe('unsafe_url');
    expect(assertAddressesPublic(['::ffff:127.0.0.1'])).toBe('unsafe_url');
    expect(assertAddressesPublic(['fe80::1'])).toBe('unsafe_url');
    expect(assertAddressesPublic([])).toBe('dns_resolution_failed');
  });

  it('6: redirect policy — private targets and limit exceeded are typed, never generic', async () => {
    // public host redirects to a private IP
    const toPrivate = await resolveUrl(
      'https://example.com/a',
      fakeNetwork({ redirects: { 'https://example.com/a': 'http://10.0.0.1/x' } }),
    );
    expect(toPrivate.ok).toBe(false);
    expect(toPrivate.failure).toBe('redirect_to_private_network');

    // hostname initially public, redirect target resolves private (DNS rebinding shape)
    const rebinding = await resolveUrl(
      'https://example.com/a',
      fakeNetwork({ redirects: { 'https://example.com/a': 'https://evil.com/b' }, dns: { 'evil.com': ['10.0.0.7'] } }),
    );
    expect(rebinding.ok).toBe(false);
    expect(rebinding.failure).toBe('redirect_to_private_network');

    // 6th redirect
    const chain: Record<string, string> = {};
    for (let i = 0; i < 6; i += 1) chain[`https://example.com/h${i}`] = `https://example.com/h${i + 1}`;
    const limit = await resolveUrl('https://example.com/h0', fakeNetwork({ redirects: chain }));
    expect(limit.ok).toBe(false);
    expect(limit.failure).toBe('redirect_limit_exceeded');
    expect(limit.redirects.length).toBe(5);

    // 5 redirects then terminal is FINE
    const chain5: Record<string, string> = {};
    for (let i = 0; i < 5; i += 1) chain5[`https://example.com/h${i}`] = `https://example.com/h${i + 1}`;
    const ok5 = await resolveUrl('https://example.com/h0', fakeNetwork({ redirects: chain5 }));
    expect(ok5.ok).toBe(true);
    expect(ok5.resource?.platform).toBe('web');
  });

  it('7: recognized-but-unsupported sources still resolve (recognition ≠ support)', async () => {
    const li = await resolveUrl('https://www.linkedin.com/posts/alice-123_activity-987', fakeNetwork({}));
    expect(li.ok).toBe(true);
    expect(li.resource?.platform).toBe('linkedin');
    expect(li.resource?.resourceType).toBe('post');
    // tiktok video
    const tt = await resolveUrl('https://www.tiktok.com/@bob/video/7123456789', fakeNetwork({}));
    expect(tt.ok && tt.resource?.platform === 'tiktok' && tt.resource?.externalId === '7123456789').toBe(true);
    // reddit comments + redd.it + user
    const rd = await resolveUrl('https://www.reddit.com/r/foo/comments/abc123/title/', fakeNetwork({}));
    expect(rd.ok && rd.resource?.externalId === 'abc123').toBe(true);
    const sh = await resolveUrl('https://redd.it/abc123', fakeNetwork({}));
    expect(sh.ok && sh.resource?.platform === 'reddit').toBe(true);
    const us = await resolveUrl('https://www.reddit.com/user/bob', fakeNetwork({}));
    expect(us.ok && us.resource?.resourceType === 'profile').toBe(true);
    // instagram variants
    const ig = await resolveUrl('https://www.instagram.com/reel/XYZ/?igsh=abc', fakeNetwork({}));
    expect(ig.ok && ig.resource?.resourceType === 'reel' && ig.resource?.externalId === 'XYZ').toBe(true);
    // bluesky post
    const bs = await resolveUrl('https://bsky.app/profile/alice.bsky.social/post/3k7q', fakeNetwork({}));
    expect(bs.ok && bs.resource?.platform === 'bluesky' && bs.resource?.externalId === '3k7q').toBe(true);
  });

  it('8: canonicalization is idempotent — canonicalize(canonicalize(url)) === canonicalize(url)', async () => {
    const first = await resolveUrl('https://www.threads.com/@alice/post/ABC?xmt=1&utm_source=t', fakeNetwork({}));
    expect(first.ok).toBe(true);
    // Re-resolving the canonical output must be a fixed point.
    const second = await resolveUrl(first.resource!.canonicalUrl, fakeNetwork({}));
    expect(second.ok).toBe(true);
    expect(second.resource!.canonicalUrl).toBe(first.resource!.canonicalUrl);
    expect(evidenceCacheKey(second.resource!)).toBe(evidenceCacheKey(first.resource!));
    // And the pure classifier alone is idempotent on canonical forms.
    const c1 = classifySocialUrl(new URL(first.resource!.canonicalUrl));
    const c2 = classifySocialUrl(new URL(c1!.canonicalUrl));
    expect(c2!.canonicalUrl).toBe(c1!.canonicalUrl);
  });

  it('9: access state stays UNKNOWN from URL alone — no privacy inference', async () => {
    // A URL that LOOKS private must still resolve; privacy is a provider
    // determination (A0's resolveAccessState), never a URL inference.
    const r = await resolveUrl('https://www.instagram.com/privateperson/', fakeNetwork({}));
    expect(r.ok).toBe(true);
    expect(r.resource?.resourceType).toBe('profile');
  });

  it('10: purity — static checks need no network; module has no SDK/fetch imports', () => {
    expect(assertStaticUrlSafety(new URL('https://example.com/'))).toBeNull();
    expect(assertStaticUrlSafety(new URL('http://169.254.169.254/'))).toBe('unsafe_url');
    const src = readFileSync(join(__dirname, '../../lib/acquisition/routing/urlResolver.ts'), 'utf8');
    expect(src).not.toMatch(/from ['\"]apify|fetch\(|axios|undici|import.*dns/);
  });
});
