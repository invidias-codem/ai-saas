import { env } from '@/lib/env';

export function blueskyCredentials(config = env): { identifier: string; password: string } {
  const identifier = config.BLUESKY_IDENTIFIER || config.BLUESKY_HANDLE;
  const password = config.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) {
    throw new Error('Bluesky requires BLUESKY_IDENTIFIER or BLUESKY_HANDLE, and BLUESKY_APP_PASSWORD');
  }
  return { identifier, password };
}
