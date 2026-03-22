import { requireAuth } from '@/lib/security/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import ChatClient from './client';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;
  
  // Authenticate user on the server to prevent unauthorized access
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    // If not authenticated, redirect or notFound, or just let client handle it
    console.error("Auth error on conversation load", err);
  }

  // Fetch initial history
  let initialMessages: any[] = [];
  try {
    if (!supabaseAdmin) {
      console.warn('supabaseAdmin is null, skipping message fetch');
      return <ChatClient conversationId={conversationId} initialMessages={initialMessages} />;
    }
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Failed to load initial messages:", error);
    } else {
      initialMessages = (messages || []).map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        text: msg.content,
        timestamp: new Date(msg.created_at).toISOString(),
        sources: [], // or map sources if applicable
      }));
    }
  } catch (err) {
    console.error("Exception loading initial messages:", err);
  }

  return <ChatClient conversationId={conversationId} initialMessages={initialMessages} />;
}
