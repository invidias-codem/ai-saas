import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getDefaultWorkspace } from '@/lib/workspaces/defaultWorkspace';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const workspace = await getDefaultWorkspace(user.userId);
    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:Workspaces:Default] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
