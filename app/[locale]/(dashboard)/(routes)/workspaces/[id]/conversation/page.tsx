import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

interface RouteParams {
  params: Promise<{ locale: string; id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceConversationPage({ params }: RouteParams) {
  const { locale, id } = await params;
  const { userId } = await auth();

  if (!userId || !supabaseAdmin) {
    redirect(`/${locale}/conversation/new?workspaceId=${encodeURIComponent(id)}`);
  }

  const { data: workspace } = await supabaseAdmin
    .from('workspaces')
    .select('id, default_operating_profile_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!workspace) {
    redirect(`/${locale}/conversation/new?workspaceId=${encodeURIComponent(id)}`);
  }

  const { data: workspaceState } = await supabaseAdmin
    .from('workspace_state')
    .select('last_open_conversation_id')
    .eq('workspace_id', id)
    .maybeSingle();

  if (workspaceState?.last_open_conversation_id) {
    const { data: existingConversation } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', workspaceState.last_open_conversation_id)
      .eq('user_id', userId)
      .eq('workspace_id', id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (existingConversation) {
      redirect(`/${locale}/conversation/${existingConversation.id}`);
    }
  }

  const { data: createdConversation } = await supabaseAdmin
    .from('conversations')
    .insert({
      user_id: userId,
      workspace_id: id,
      operating_profile_id: workspace.default_operating_profile_id || null,
      title: 'New Conversation',
      is_deleted: false,
      is_archived: false,
    })
    .select('id')
    .single();

  if (createdConversation?.id) {
    await supabaseAdmin.from('workspace_state').upsert({
      workspace_id: id,
      last_open_conversation_id: createdConversation.id,
      last_open_tab: 'conversation',
    });

    redirect(`/${locale}/conversation/${createdConversation.id}`);
  }

  redirect(`/${locale}/conversation/new?workspaceId=${encodeURIComponent(id)}`);
}
