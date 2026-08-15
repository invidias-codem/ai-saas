import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });

  if (!supabaseAdmin) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const { data, error } = await supabaseAdmin
    .from('workspace_personas')
    .select('*')
    .eq('workspace_id', workspaceId);

  return NextResponse.json({ data, error: error?.message || null });
}
