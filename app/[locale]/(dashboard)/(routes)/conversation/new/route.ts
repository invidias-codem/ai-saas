import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { getDefaultWorkspace } from '@/lib/workspaces/defaultWorkspace';

export const dynamic = 'force-dynamic';

/**
 * Fat route handler: creates a fresh, workspace-scoped conversation and
 * redirects into it. Guarantees a blank slate (never reuses last-open),
 * stamps workspace_id + operating_profile_id, and updates the workspace
 * "last open" pointer so the slice-2 resolver chain stays consistent.
 *
 * Supports ?workspaceId=<id> to scope creation to a non-default workspace.
 */
interface RouteContext {
  params: Promise<{ locale: string }>;
}

export async function GET(req: Request, { params }: RouteContext) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }
  if (!supabaseAdmin) {
    console.error('[Conversation:New] Supabase admin not configured');
    redirect(`/${locale}/dashboard`);
  }

  const { searchParams } = new URL(req.url);
  const requestedWorkspaceId = searchParams.get('workspaceId');

  // Resolve target workspace: explicit param (validated for ownership) or default.
  let workspace: { id: string; default_operating_profile_id: string | null } | null = null;

  if (requestedWorkspaceId) {
    const { data } = await supabaseAdmin
      .from('workspaces')
      .select('id, default_operating_profile_id')
      .eq('id', requestedWorkspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    workspace = data;
  }

  if (!workspace) {
    const fallback = await getDefaultWorkspace(userId);
    workspace = { id: fallback.id, default_operating_profile_id: (fallback as any).default_operating_profile_id ?? null };
  }

  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      user_id: userId,
      workspace_id: workspace.id,
      operating_profile_id: workspace.default_operating_profile_id || null,
      title: 'New Conversation',
      is_deleted: false,
      is_archived: false,
    })
    .select('id')
    .single();

  if (error || !conversation) {
    console.error('[Conversation:New] Error creating conversation:', error);
    redirect(`/${locale}/dashboard`);
  }

  await supabaseAdmin.from('workspace_state').upsert({
    workspace_id: workspace.id,
    last_open_conversation_id: conversation.id,
    last_open_tab: 'conversation',
  });

  redirect(`/${locale}/conversation/${conversation.id}`);
}
