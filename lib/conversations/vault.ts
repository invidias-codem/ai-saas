// lib/conversations/vault.ts
// Shared vault query + mapping, consumed by both the API route
// (app/api/conversations/vault/route.ts) and the server-side Vault page.

import { auth } from '@clerk/nextjs/server';

export type VaultFilter = 'all' | 'active' | 'archived' | 'deleted';

export interface VaultConversation {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  lastUpdated: number;
  isArchived: boolean;
  isDeleted: boolean;
  preview?: string;
  deletedAt?: number;
  daysUntilPurge?: number;
}

export interface VaultData {
  conversations: VaultConversation[];
  counts: { all: number; active: number; archived: number; deleted: number };
  filter: string;
}

export async function getVaultData(filter: VaultFilter = 'all'): Promise<VaultData> {
  const { userId } = await auth();
  if (!userId) {
    return { conversations: [], counts: { all: 0, active: 0, archived: 0, deleted: 0 }, filter };
  }

  const { supabase } = await import('@/lib/supabaseClient');
  if (!supabase) {
    throw new Error('Database configuration missing');
  }

  let query = supabase
    .from('conversations')
    .select(`
      *,
      messages (
        content,
        created_at,
        role
      )
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  switch (filter) {
    case 'active':
      query = query.eq('is_deleted', false).eq('is_archived', false);
      break;
    case 'archived':
      query = query.eq('is_deleted', false).eq('is_archived', true);
      break;
    case 'deleted':
      query = query.eq('is_deleted', true);
      break;
  }

  const { data: conversations, error } = await query.limit(100);
  if (error) {
    console.error('[Vault] Supabase error:', error);
    throw new Error('Failed to fetch conversations');
  }

  const conversationIds = (conversations || []).map((c: any) => c.id);

  let messageCounts: Record<string, number> = {};
  if (conversationIds.length > 0) {
    const { data: countData } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds);

    if (countData) {
      for (const msg of countData) {
        messageCounts[msg.conversation_id] = (messageCounts[msg.conversation_id] || 0) + 1;
      }
    }
  }

  const mappedConversations: VaultConversation[] = (conversations || []).map((c: any) => {
    const msgs = (c.messages || []).sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    let preview = lastMsg?.content?.substring(0, 100) || '';
    if (lastMsg?.content?.length > 100) preview += '...';

    const count = messageCounts[c.id] || msgs.length;

    let daysUntilPurge: number | undefined;
    let deletedAt: number | undefined;
    if (c.is_deleted && c.deleted_at) {
      deletedAt = new Date(c.deleted_at).getTime();
      const daysSinceDelete = Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
      daysUntilPurge = Math.max(0, 30 - daysSinceDelete);
    }

    return {
      id: c.id,
      title: c.title,
      messageCount: count,
      createdAt: new Date(c.created_at).getTime(),
      lastUpdated: new Date(c.updated_at).getTime(),
      isArchived: c.is_archived || false,
      isDeleted: c.is_deleted || false,
      preview,
      deletedAt,
      daysUntilPurge,
    };
  });

  const counts = {
    all: mappedConversations.length,
    active: mappedConversations.filter((c) => !c.isDeleted && !c.isArchived).length,
    archived: mappedConversations.filter((c) => !c.isDeleted && c.isArchived).length,
    deleted: mappedConversations.filter((c) => c.isDeleted).length,
  };

  return { conversations: mappedConversations, counts, filter };
}
