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

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'api');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { deviceId, platform, activeApp, screenContextSummary, fileContext, networkClass, batteryState } = body;

    if (!deviceId || !platform) {
      return NextResponse.json({ error: 'deviceId and platform are required' }, { status: 400 });
    }

    if (supabaseAdmin) {
      const { error: insertError } = await supabaseAdmin
        .from('relay_observations')
        .insert({
          user_id: user.userId,
          device_id: deviceId,
          platform,
          active_app: activeApp,
          screen_context_summary: screenContextSummary,
          file_context: fileContext,
          network_class: networkClass,
          battery_state: batteryState,
        });

      if (insertError) {
        logger.error('[Relay Observe] Failed to store observation:', insertError);
        return NextResponse.json({ error: 'Failed to store observation' }, { status: 500 });
      }

      logger.info(`[Relay Observe] Observation stored for device ${deviceId}`);
    }

    return NextResponse.json({ acknowledged: true });

  } catch (error: any) {
    logger.error("[Relay Observe API Error]", error);
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
