// lib/acquisition/routing/urlResolver.ts
// A1: URL Resolver + SSRF Gate. Every provider receives a safe, canonical
// CanonicalResource — never a raw user URL.
//
// Purity split (locked):
//   PURE  — classify/parse/canonicalize/identity, private-range checks,
//           redirect-chain policy decisions
//   I/O   — DNS resolution + redirect following, INJECTED as a
//           NetworkBoundary. Tests run deterministic fixtures with no
//           Internet; production injects dns + fetch.
//
// Failure taxonomy (typed, never generic):
//   invalid_url | unsafe_url | redirect_limit_exceeded |
//   redirect_to_private_network | dns_resolution_failed

import { isPrivateIp } from '@/lib/security/urlValidator';
import type {
  AcquisitionFailure,
  CanonicalResource,
  ResourceType,
  SocialPlatform,
} from '../contracts';

// ── Injected network boundary ───────────────────────────────────────────

export interface NetworkBoundary {
  /** Resolve ALL A/AAAA answers for a hostname. */
  resolve(hostname: string): Promise<string[]>;
  /** Follow one redirect hop; return the Location header or null. */
  nextRedirect(url: string): Promise<string | null>;
}

/** Deterministic test doubles + production wiring both satisfy this. */

// ── Route table: recognition ≠ support ──────────────────────────────────

interface RouteMatch {
  platform: SocialPlatform;
  resourceType: ResourceType;
  externalId?: string;
  handle?: string;
  /** Platform-specific canonical URL (tracking stripped HERE only). */
  canonicalUrl: string;
}

/** Strip platform-known tracking params; NEVER strip query params globally. */
function stripKnownTracking(url: URL): URL {
  const out = new URL(url.toString());
  for (const p of ['xmt', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'igsh', 'share_url', 'fbclid', 'si']) {
    out.searchParams.delete(p);
  }
  return out;
}

/** Normalize host: drop www. and lowercase so www/non-www collapse to one identity. */
function normalizeHost(url: URL): URL {
  const out = stripKnownTracking(url);
  out.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  return out;
}

const SOCIAL_HOSTS: Record<string, SocialPlatform> = {
  'threads.net': 'threads',
  'threads.com': 'threads',
  'instagram.com': 'instagram',
  'reddit.com': 'reddit',
  'redd.it': 'reddit',
  'linkedin.com': 'linkedin',
  'tiktok.com': 'tiktok',
  'bsky.app': 'bluesky',
};

function platformOf(hostname: string): SocialPlatform | null {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (SOCIAL_HOSTS[h]) return SOCIAL_HOSTS[h];
  for (const [domain, platform] of Object.entries(SOCIAL_HOSTS)) {
    if (h.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

/**
 * PURE classify/parse/canonicalize for the recognized social platforms.
 * Recognition does NOT imply provider support — capability is A2's question.
 */
export function classifySocialUrl(url: URL): RouteMatch | null {
  const platform = platformOf(url.hostname);
  if (!platform) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const clean = normalizeHost(url);

  switch (platform) {
    case 'threads': {
      // /@handle/post/:id | /@handle
      if (parts.length >= 3 && parts[0]?.startsWith('@') && parts[1] === 'post' && parts[2]) {
        const handle = parts[0].slice(1);
        const id = parts[2];
        clean.pathname = `/@${handle}/post/${id}`;
        return { platform, resourceType: 'post', externalId: id, handle, canonicalUrl: clean.toString() };
      }
      if (parts.length === 1 && parts[0]?.startsWith('@')) {
        const handle = parts[0].slice(1);
        clean.pathname = `/@${handle}`;
        return { platform, resourceType: 'profile', handle, canonicalUrl: clean.toString() };
      }
      return null;
    }
    case 'instagram': {
      // /p/:id | /reel/:id | /stories/:handle/:id | /:handle
      if (parts[0] === 'p' && parts[1]) {
        clean.pathname = `/p/${parts[1]}`;
        return { platform, resourceType: 'post', externalId: parts[1], canonicalUrl: clean.toString() };
      }
      if (parts[0] === 'reel' && parts[1]) {
        clean.pathname = `/reel/${parts[1]}`;
        return { platform, resourceType: 'reel', externalId: parts[1], canonicalUrl: clean.toString() };
      }
      if (parts[0] === 'stories' && parts[1]) {
        clean.pathname = `/stories/${parts[1]}`;
        return { platform, resourceType: 'story', handle: parts[1], canonicalUrl: clean.toString() };
      }
      if (parts.length === 1 && parts[0]) {
        clean.pathname = `/${parts[0]}`;
        return { platform, resourceType: 'profile', handle: parts[0], canonicalUrl: clean.toString() };
      }
      return null;
    }
    case 'reddit': {
      // /r/:sub/comments/:id/... | /comments/:id/... | /user/:name | redd.it/:id
      const commentsIdx = parts.indexOf('comments');
      if (commentsIdx >= 0 && parts[commentsIdx + 1]) {
        const id = parts[commentsIdx + 1];
        clean.pathname = parts.slice(0, commentsIdx + 2).join('/');
        return { platform, resourceType: 'post', externalId: id, canonicalUrl: clean.toString() };
      }
      if (url.hostname === 'redd.it' && parts[0]) {
        clean.hostname = 'redd.it';
        clean.pathname = `/${parts[0]}`;
        return { platform, resourceType: 'post', externalId: parts[0], canonicalUrl: clean.toString() };
      }
      if (parts[0] === 'user' && parts[1]) {
        clean.pathname = `/user/${parts[1]}`;
        return { platform, resourceType: 'profile', handle: parts[1], canonicalUrl: clean.toString() };
      }
      return null;
    }
    case 'linkedin': {
      if (parts[0] === 'posts' || parts[0] === 'feed') {
        clean.pathname = `/${parts[0]}/${parts[1] ?? ''}`;
        return { platform, resourceType: 'post', externalId: parts[1], canonicalUrl: clean.toString() };
      }
      if (parts[0] === 'in' && parts[1]) {
        clean.pathname = `/in/${parts[1]}`;
        return { platform, resourceType: 'profile', handle: parts[1], canonicalUrl: clean.toString() };
      }
      if (parts[0] === 'company' && parts[1]) {
        clean.pathname = `/company/${parts[1]}`;
        return { platform, resourceType: 'profile', handle: parts[1], canonicalUrl: clean.toString() };
      }
      return null;
    }
    case 'tiktok': {
      if (parts[0]?.startsWith('@') && parts[1] === 'video' && parts[2]) {
        const handle = parts[0].slice(1);
        clean.pathname = `/@${handle}/video/${parts[2]}`;
        return { platform, resourceType: 'video', externalId: parts[2], handle, canonicalUrl: clean.toString() };
      }
      if (parts[0]?.startsWith('@')) {
        const handle = parts[0].slice(1);
        clean.pathname = `/@${handle}`;
        return { platform, resourceType: 'profile', handle, canonicalUrl: clean.toString() };
      }
      return null;
    }
    case 'bluesky': {
      // /profile/:didOrHandle/post/:rkey | /profile/:didOrHandle
      if (parts[0] === 'profile' && parts[1]) {
        if (parts[2] === 'post' && parts[3]) {
          clean.pathname = `/profile/${parts[1]}/post/${parts[3]}`;
          return { platform, resourceType: 'post', externalId: parts[3], handle: parts[1], canonicalUrl: clean.toString() };
        }
        clean.pathname = `/profile/${parts[1]}`;
        return { platform, resourceType: 'profile', handle: parts[1], canonicalUrl: clean.toString() };
      }
      return null;
    }
    default:
      return null;
  }
}

// ── Resolution result ───────────────────────────────────────────────────

export interface UrlResolution {
  ok: boolean;
  failure?: AcquisitionFailure;
  resource?: CanonicalResource;
  /** Redirect chain actually followed (provenance). */
  redirects: string[];
}

const MAX_REDIRECTS = 5;

/**
 * Unwrap IPv4-mapped IPv6 for range checks. Node normalizes the dotted form
 * (::ffff:10.0.0.1) to compressed hex (::ffff:a00:1), so convert hex groups
 * back to a dotted quad before testing private ranges.
 */
function unwrapIpv4Mapped(host: string): string {
  if (!host.startsWith('::ffff:')) return host;
  const rest = host.slice(7);
  if (!rest.includes(':')) return rest; // already dotted
  const groups = rest.split(':').map((g) => g.padStart(4, '0'));
  const bytes: number[] = [];
  for (const g of groups) {
    const v = parseInt(g, 16);
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  return bytes.join('.');
}

/** PURE static safety: protocol, credentials, literal private IPs, local names. */
export function assertStaticUrlSafety(url: URL): AcquisitionFailure | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unsafe_url';
  if (url.username || url.password) return 'unsafe_url';
  // Strip IPv6 brackets, then unwrap IPv4-mapped forms before range checks.
  const raw = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const h = unwrapIpv4Mapped(raw);
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return 'unsafe_url';
  if (isPrivateIp(h)) return 'unsafe_url';
  return null;
}

/** PURE address check — every resolved A/AAAA answer must be public. */
export function assertAddressesPublic(addresses: string[]): AcquisitionFailure | null {
  if (addresses.length === 0) return 'dns_resolution_failed';
  for (const a of addresses) {
    // IPv4-mapped IPv6 (::ffff:10.0.0.1) must unwrap before the range check.
    const unwrapped = a.toLowerCase().startsWith('::ffff:') ? a.slice(7) : a;
    if (isPrivateIp(unwrapped)) return 'unsafe_url';
  }
  return null;
}

/**
 * resolveUrl — the A1 pipeline. NetworkBoundary injected; core decisions pure.
 * Redirect policy: static safety + full address re-validation on EVERY hop
 * (DNS rebinding / redirect-to-private cannot bypass the gate).
 */
export async function resolveUrl(
  rawUrl: string,
  network: NetworkBoundary,
): Promise<UrlResolution> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, failure: 'invalid_url', redirects: [] };
  }

  const staticFail = assertStaticUrlSafety(current);
  if (staticFail) return { ok: false, failure: staticFail, redirects: [] };

  const redirects: string[] = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // DNS gate: resolve and validate EVERY address before following anything.
    let addresses: string[];
    try {
      addresses = await network.resolve(current.hostname);
    } catch {
      return { ok: false, failure: 'dns_resolution_failed', redirects };
    }
    const addrFail = assertAddressesPublic(addresses);
    if (addrFail) {
      return { ok: false, failure: hop === 0 ? addrFail : 'redirect_to_private_network', redirects };
    }

    let next: string | null;
    try {
      next = await network.nextRedirect(current.toString());
    } catch {
      next = null; // network read errors on the CONTENT fetch are not safety failures
    }

    if (next === null) {
      // Terminal URL: classify.
      const match = classifySocialUrl(current);
      const resource: CanonicalResource = match
        ? {
            platform: match.platform,
            resourceType: match.resourceType,
            originalUrl: rawUrl,
            canonicalUrl: match.canonicalUrl,
            externalId: match.externalId,
            handle: match.handle,
          }
        : {
            platform: 'web',
            resourceType: 'unknown',
            originalUrl: rawUrl,
            canonicalUrl: current.toString(),
          };
      return { ok: true, resource, redirects };
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(next, current);
    } catch {
      return { ok: false, failure: 'invalid_url', redirects };
    }
    const nextStaticFail = assertStaticUrlSafety(nextUrl);
    if (nextStaticFail) {
      return { ok: false, failure: 'redirect_to_private_network', redirects };
    }
    if (hop === MAX_REDIRECTS) {
      return { ok: false, failure: 'redirect_limit_exceeded', redirects };
    }
    redirects.push(nextUrl.toString());
    current = nextUrl;
  }
  return { ok: false, failure: 'redirect_limit_exceeded', redirects };
}
