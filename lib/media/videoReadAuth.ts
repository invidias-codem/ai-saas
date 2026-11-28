import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getClientIP } from '@/lib/security/apiAuth';

export async function limitVideoRead(request: Request, userId: string) {
  const result = await limitApiEndpoint(`video-read:${userId}`, getClientIP(request), 'query');
  return result.success ? null : Response.json({ error: 'Too many requests' }, {
    status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))) },
  });
}
