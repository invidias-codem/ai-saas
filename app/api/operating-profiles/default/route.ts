import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { ensureDefaultOperatingProfile } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const profile = await ensureDefaultOperatingProfile(user.userId);
    return NextResponse.json({ success: true, operatingProfile: profile });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:OperatingProfiles:Default] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
