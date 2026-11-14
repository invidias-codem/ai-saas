import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { listOwnerConversationRuns } from '@/lib/ucol/continuity/runStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // This flag MUST stay off until the durable worker writes verified data.
  if (process.env.ENABLE_CONVERSATION_CONTINUITY !== 'true') {
    return Response.json({ error: 'Conversation continuity is not enabled' }, { status: 404 });
  }
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    if (!UUID.test(id)) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }
    const runs = await listOwnerConversationRuns(id, userId);
    // The same 404 for an absent or other-user conversation.
    if (!runs) return Response.json({ error: 'Conversation not found' }, { status: 404 });
    return Response.json({ runs }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[Conversation:Continuity] owner-scoped run lookup failed');
    return Response.json({ error: 'Continuity temporarily unavailable' }, { status: 503 });
  }
}
