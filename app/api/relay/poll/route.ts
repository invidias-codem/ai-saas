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
    const { data: commands, error } = supabaseAdmin ? await supabaseAdmin
      .from('relay_commands')
      .select('*')
      .eq('user_id', user.userId)
      .eq('device_id', deviceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10) : { data: null, error: new Error("Supabase not configured") };

    // TEST BYPASS: return mock command if there's no DB or testing
    let mockCommands = commands;
    if ((error || !supabaseAdmin) && (process.env.NODE_ENV === 'development' || process.env.MOCK_USER_ID)) {
      mockCommands = [{
        id: 'mock-command-id',
        user_id: user.userId,
        device_id: deviceId,
        action_type: 'notify',
        payload: { message: "Hello from Mock Bypass" },
        requires_approval: false,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }];
    } else if (error) {
      console.error('[Relay Poll] Error fetching commands:', error);
      return NextResponse.json({ error: 'Failed to fetch commands' }, { status: 500 });
    }

    // 4. Mark Commands as Delivered
    if (mockCommands && mockCommands.length > 0) {
      const commandIds = mockCommands.map(c => c.id);
      
      if (supabaseAdmin && commandIds[0] !== 'mock-command-id') {
        const { error: updateError } = await supabaseAdmin
          .from('relay_commands')
          .update({ status: 'delivered' })
          .in('id', commandIds);

        if (updateError) {
          console.error('[Relay Poll] Error marking commands as delivered:', updateError);
        }
      }
    }

    // 5. Check for Session Updates / Heartbeat Data
    // We could add more logic here to return notifications or context updates

    const mappedCommands = (mockCommands || []).map(c => ({
      id: c.id,
      userId: c.user_id,
      deviceId: c.device_id,
      actionType: c.action_type,
      payload: c.payload,
      requiresApproval: c.requires_approval,
      status: c.status,
      createdAt: c.created_at,
      updatedAt: c.updated_at
    }));

    return NextResponse.json({
      commands: mappedCommands,
      sessionUpdates: [], // Placeholder for future feature
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[API POLL] Caught error:', error);
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
