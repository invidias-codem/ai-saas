import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    // commandId: the ID from relay_commands
    // status: 'success' | 'failure' | 'rejected'
    // data: arbitrary output from the device
    // durationMs: how long it took
    const { commandId, status, data, durationMs, error } = body;

    if (!commandId || !status) {
      return NextResponse.json({ error: 'commandId and status are required' }, { status: 400 });
    }

    if (supabaseAdmin) {
      const { error: updateError } = await supabaseAdmin
        .from('relay_commands')
        .update({
          status: status,
          updated_at: new Date().toISOString(),
          // we could store the result payload if we add a 'result_payload' column,
          // but for now, we just update the status to trigger the next loop step.
        })
        .eq('id', commandId)
        .eq('user_id', user.userId);

      if (updateError) {
        logger.error('[Relay Result] Failed to update command:', updateError);
        return NextResponse.json({ error: 'Failed to update command' }, { status: 500 });
      }

      // TODO: If the status is final (success/failure), this is where we would 
      // resume the ReAct loop or notify the background worker that the device 
      // action has completed.
      logger.info(`[Relay Result] Command ${commandId} updated to ${status} in ${durationMs || 0}ms`);
    }

    return NextResponse.json({ acknowledged: true });

  } catch (error: any) {
    logger.error("[Relay Result API Error]", error);
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
