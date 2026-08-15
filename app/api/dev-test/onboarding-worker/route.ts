import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const provided = req.nextUrl.searchParams.get('dev_token');
  const expected = process.env.DEV_BYPASS_TOKEN;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'Missing dev_token' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { workspaceId, domainIntent, urls, notes } = body || {};

  if (workspaceId && domainIntent && supabaseAdmin) {
    await supabaseAdmin.from('workspace_personas').upsert({
      workspace_id: workspaceId,
      user_id: 'dev-bypass-user',
      name: `${workspaceId} persona`,
      content: `# ${domainIntent}\n\nTest persona content.`,
      model: 'gemini-2.5-flash',
    });
  }

  return NextResponse.json({ accepted: true, workspaceId, domainIntent, urls, notes });
}
