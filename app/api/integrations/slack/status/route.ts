import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Import centralized client
    const { supabaseAdmin } = await import('@/lib/supabaseClient');

    if (!supabaseAdmin) {
      console.error('[SLACK_STATUS] Supabase Admin client missing');
      return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
    }

    // Query for user's specific integration
    const { data: integration, error } = await supabaseAdmin
      .from('slack_integrations')
      .select('slack_team_name, bot_user_id, created_at')
      .eq('user_id', userId)
      .single();

    if (error || !integration) {
      // No integration found for this user
      return NextResponse.json({
        connected: false,
        message: 'No Slack integration found',
      });
    }

    // Found valid integration
    return NextResponse.json({
      connected: true,
      workspaceName: integration.slack_team_name || 'Unknown Workspace',
      botUserId: integration.bot_user_id,
      notificationsEnabled: true,
      lastSync: integration.created_at,
    });

  } catch (error: any) {
    console.error('[SLACK_STATUS_ERROR]', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to get Slack status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
