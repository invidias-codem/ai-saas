const DEFAULT_SITE_URL = 'https://gen1e.xyz';

export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_SITE_URL;

  return raw.replace(/\/$/, '');
}
