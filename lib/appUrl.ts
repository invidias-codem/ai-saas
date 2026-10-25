// lib/appUrl.ts
// Single seam for building absolute app URLs from NEXT_PUBLIC_APP_URL.
// Raw string concatenation produced "https://host//api/..." whenever the env
// carried a trailing slash — and the GitHub OAuth auth route sends that as
// redirect_uri, which GitHub rejects before token exchange. Normalize the base
// once and join with new URL() everywhere (#446 follow-up, #447 review).
//
// ponytail: other routes (slack/trello/stripe/upload) share the raw-concat
// pattern but each sends redirect_uri to its own provider registration —
// change them only after verifying those registered callbacks, one at a time.

export function appBaseUrl(raw: string | undefined | null): string {
  const candidate = (raw ?? '').trim();
  if (!candidate) {
    throw new Error('App base URL missing (NEXT_PUBLIC_APP_URL)');
  }
  let parsed: URL;
  try {
    // Strip trailing slashes so "https://host///" parses to the bare origin.
    parsed = new URL(candidate.replace(/\/+$/, ''));
  } catch {
    throw new Error(`App base URL is not a valid URL: ${candidate}`);
  }
  // #447 review P2: strict origin validation — OAuth redirect_uri is built
  // here, so anything beyond scheme+host is a typed failure, never a silent
  // bad URL. http allowed only because local dev uses it.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`App base URL must be http(s), got '${parsed.protocol}'`);
  }
  if (!parsed.hostname) {
    throw new Error('App base URL requires a hostname');
  }
  if (parsed.username || parsed.password) {
    throw new Error('App base URL must not contain credentials');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    // A base with its own path would silently swallow the joined path —
    // fail loudly instead of building an OAuth redirect_uri nobody registered.
    throw new Error(`App base URL must be an origin (scheme + host), got a path: ${candidate}`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error('App base URL must not contain a query or fragment');
  }
  // The validated origin: scheme + host (+ port), no trailing slash.
  return parsed.origin;
}

/** Join an absolute path onto the app base — never produces a double slash. */
export function appUrl(path: string, raw: string | undefined | null): string {
  return new URL(path, appBaseUrl(raw)).toString();
}
