// lib/conversations/list.ts
// Shared conversation list query, consumed by both the API route
// (app/api/conversations/route.ts) and the dashboard RSC layout
// (for sidebar seeding). Single source of truth for the "recent
// conversations" shape.
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export interface ConversationListItem {
  id: string;
  workspaceId?: string | null;
  title: string;
  messageCount: number;
  createdAt: number;
  lastUpdated: number;
  isArchived: boolean;
  preview?: string;
}

export interface ConversationListPayload {
  conversations: ConversationListItem[];
  total: number;
}

export async function getConversationsForUser(): Promise<ConversationListPayload> {
  const { userId } = await auth();
  if (!userId || !supabaseAdmin) {
    return { conversations: [], total: 0 };
  }

  const { data: conversations, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      workspace_id,
      title,
      is_archived,
      created_at,
      updated_at,
      messages ( content, created_at, role )
    `)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Conversations:list] Supabase error:', error);
    return { conversations: [], total: 0 };
  }

  const mapped: ConversationListItem[] = (conversations || []).map((c: any) => {
    const msgs = (c.messages || []).slice().sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    let preview = lastMsg?.content?.substring(0, 100) ?? '';
    if (lastMsg?.content && lastMsg.content.length > 100) preview += '...';

    return {
      id: c.id,
      workspaceId: c.workspace_id ?? null,
      title: c.title,
      messageCount: msgs.length,
      createdAt: new Date(c.created_at).getTime(),
      lastUpdated: new Date(c.updated_at).getTime(),
      isArchived: c.is_archived ?? false,
      preview,
    };
  });

  return { conversations: mapped, total: mapped.length };
}
