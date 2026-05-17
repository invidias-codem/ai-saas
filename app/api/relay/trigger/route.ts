import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // Note: Webhook triggers might use API keys instead of standard user auth in a real system,
    // but we use requireAuth here to maintain consistency for user-driven automation testing.
    const user = await requireAuth();
    const ip = getClientIP(req);

    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const { deviceId, eventName, payload } = body;

    if (!deviceId || !eventName) {
      return NextResponse.json({ error: 'deviceId and eventName are required' }, { status: 400 });
    }

    // A trigger could dispatch a command directly to the device.
    // E.g., 'calendar_event' -> 'send_notification' action on the device.
    if (supabaseAdmin) {
      const { data: command, error: insertError } = await supabaseAdmin
        .from('relay_commands')
        .insert({
          user_id: user.userId,
          device_id: deviceId,
          action_type: 'notify',
          payload: {
            title: `Trigger: ${eventName}`,
            body: JSON.stringify(payload || {}),
          },
          requires_approval: false,
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertError) {
        logger.error('[Relay Trigger] Failed to dispatch command:', insertError);
        return NextResponse.json({ error: 'Failed to dispatch command' }, { status: 500 });
      }

      logger.info(`[Relay Trigger] Dispatched command ${command?.id} for event ${eventName}`);
      return NextResponse.json({ acknowledged: true, commandId: command?.id });
    }

    return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });

  } catch (error: any) {
    logger.error("[Relay Trigger API Error]", error);
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
