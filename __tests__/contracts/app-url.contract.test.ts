/**
 * #446 follow-up — app URL construction contracts.
 *
 * Raw concatenation of NEXT_PUBLIC_APP_URL produced "//api/..." on trailing
 * slashes; the GitHub OAuth auth route sent that as redirect_uri, which
 * GitHub rejects before token exchange. The seam normalizes the base and
 * joins with new URL().
 */
import { appBaseUrl, appUrl } from '@/lib/appUrl';

describe('appUrl — normalized base, never a double slash (#446 follow-up)', () => {
  it('joins a clean base with an absolute path', () => {
    expect(appUrl('/api/integrations/github/callback', 'https://gen1e.xyz')).toBe(
      'https://gen1e.xyz/api/integrations/github/callback',
    );
  });

  it('a trailing slash in the env never produces //api', () => {
    expect(appUrl('/api/integrations/github/callback', 'https://gen1e.xyz/')).toBe(
      'https://gen1e.xyz/api/integrations/github/callback',
    );
    expect(appUrl('/settings?github=connected', 'https://gen1e.xyz///')).toBe(
      'https://gen1e.xyz/settings?github=connected',
    );
  });

  it('preserves the query string through the join', () => {
    expect(appUrl('/settings?github=error&message=x', 'https://gen1e.xyz/')).toBe(
      'https://gen1e.xyz/settings?github=error&message=x',
    );
  });

  it('garbage and empty bases are typed failures — never a silently bad URL', () => {
    expect(() => appBaseUrl('')).toThrow();
    expect(() => appBaseUrl(undefined)).toThrow();
    expect(() => appBaseUrl('not-a-url')).toThrow();
    expect(() => appUrl('/x', null)).toThrow();
  });

  it('a base with its own path is rejected at the trust boundary', () => {
    // A base path would silently swallow the joined path — fail loudly
    // instead of building an OAuth redirect_uri nobody registered.
    expect(() => appBaseUrl('https://host/some-path')).toThrow();
  });
});
