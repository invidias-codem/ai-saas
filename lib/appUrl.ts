// lib/appUrl.ts
// Single seam for building absolute app URLs from NEXT_PUBLIC_APP_URL.
// Raw string concatenation produced "https://host//api/..." whenever the env
// carried a trailing slash — and the GitHub OAuth auth route sends that as
// redirect_uri, which GitHub rejects before token exchange. Normalize the base
// once and join with new URL() everywhere (#446 follow-up).
//
// ponytail: other routes (slack/trello/stripe/upload) share the raw-concat
// pattern but each sends redirect_uri to its own provider registration —
// change them only after verifying those registered callbacks, one at a time.

export function appBaseUrl(raw: string | undefined | null): string {
  const candidate = (raw ?? '').trim();
  if (!candidate) {
    throw new Error('App base URL missing (NEXT_PUBLIC_APP_URL)');
  }
  const normalized = candidate.replace(/\/+$/, '');
  // new URL validates the scheme+host at a trust boundary: OAuth redirect_uri
  // is built here, so garbage is a typed failure, never a silent bad URL.
  const parsed = new URL(normalized);
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    // A base with its own path would silently swallow the joined path —
    // fail loudly instead of building an OAuth redirect_uri nobody registered.
    throw new Error(`App base URL must be an origin (scheme + host), got a path: ${candidate}`);
  }
  return parsed.toString().replace(/\/+$/, '');
}

/** Join an absolute path onto the app base — never produces a double slash. */
export function appUrl(path: string, raw: string | undefined | null): string {
  return new URL(path, appBaseUrl(raw)).toString();
}
