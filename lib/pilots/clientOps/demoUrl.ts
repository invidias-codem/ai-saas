// lib/pilots/clientOps/demoUrl.ts
// Absolute URL helpers for server-side fetch calls.
// Next.js server components cannot fetch relative URLs in Node runtime;
// they need an absolute origin. Prefer NEXT_PUBLIC_SITE_URL; fall back to
// deriving the origin from request headers.

import { headers } from 'next/headers';

export async function apiBaseUrl(): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return siteUrl.replace(/\/$/, '');

  const h = await headers();
  const host = h.get('host');
  const proto =
    h.get('x-forwarded-proto') ?? (host?.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host ?? 'localhost'}`;
}

export async function apiUrl(
  path: string,
  params?: Record<string, string>
): Promise<string> {
  const url = new URL(path, await apiBaseUrl());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}
