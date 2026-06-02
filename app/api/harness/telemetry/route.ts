import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });
    if (!supabaseAdmin) return new NextResponse('Supabase Admin not configured', { status: 500 });

    const events = await req.json();
    if (!Array.isArray(events)) {
      return new NextResponse('Invalid payload: expected an array of events', { status: 400 });
    }

    const records = events.map((event: any) => ({
      user_id: userId,
      workspace_id: event.workspace_id || null,
      event_type: event.event_type || 'unknown',
      path_accessed: event.path_accessed || null,
      success: typeof event.success === 'boolean' ? event.success : false,
      error_message: event.error_message || null,
      duration_ms: typeof event.duration_ms === 'number' ? event.duration_ms : null,
      operation_type: event.operation_type || 'unknown',
      created_at: event.timestamp || new Date().toISOString(),
    }));

    if (records.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    const { error } = await supabaseAdmin
      .from('harness_telemetry_events')
      .insert(records);

    if (error) {
      console.error('[HARNESS_TELEMETRY_INSERT]', error);
      return new NextResponse('Failed to insert telemetry events', { status: 500 });
    }

    return NextResponse.json({ success: true, inserted: records.length });
  } catch (error) {
    console.error('[HARNESS_TELEMETRY]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
