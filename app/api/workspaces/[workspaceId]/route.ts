import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const requestedWorkspaceId = searchParams.get('workspaceId') || params.workspaceId;

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, org_id, user_id, name, created_at, updated_at')
    .eq('id', requestedWorkspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workspace: data ?? null });
}
