import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseClient';

export async function GET(req: Request) {
  try {
    // 1. Authentication
    const user = await requireAuth();
    const ip = getClientIP(req);

    // 2. Rate Limiting
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }
    const url = new URL(req.url);
    const deviceId = url.searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json({ error: 'Missing deviceId parameter' }, { status: 400 });
    }

    // 3. Fetch Pending Commands
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { data: commands, error } = await supabaseAdmin
      .from('relay_commands')
      .select('*')
      .eq('user_id', user.userId)
      .eq('device_id', deviceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      console.error('[Relay Poll] Error fetching commands:', error);
      return NextResponse.json({ error: 'Failed to fetch commands' }, { status: 500 });
    }

    // 4. Mark Commands as Delivered
    if (commands && commands.length > 0) {
      const commandIds = commands.map(c => c.id);
      
      const { error: updateError } = await supabaseAdmin
        .from('relay_commands')
        .update({ status: 'delivered' })
        .in('id', commandIds);

      if (updateError) {
        console.error('[Relay Poll] Error marking commands as delivered:', updateError);
        // We still return the commands so the device can process them,
        // but this might cause duplicates if not handled idempotently by the device.
      }
    }

    // 5. Check for Session Updates / Heartbeat Data
    // We could add more logic here to return notifications or context updates

    return NextResponse.json({
      commands: commands || [],
      sessionUpdates: [], // Placeholder for future feature
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleAuthError(error);
  }
}
