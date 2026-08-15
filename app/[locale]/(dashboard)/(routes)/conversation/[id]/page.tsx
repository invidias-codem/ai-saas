import { requireAuth } from '@/lib/security/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import ChatClient from './client';

export const dynamic = 'force-dynamic';

interface ConversationContext {
  workspaceId: string | null;
  workspaceName: string | null;
  operatingProfileId: string | null;
  operatingProfileName: string | null;
  operatingProfileMode: string | null;
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params;

  try {
    await requireAuth();
  } catch (err) {
    console.error('Auth error on conversation load', err);
  }

  let initialMessages: any[] = [];
  let conversationContext: ConversationContext = {
    workspaceId: null,
    workspaceName: null,
    operatingProfileId: null,
    operatingProfileName: null,
    operatingProfileMode: null,
  };
  let initialConsultantGreeting: string | null = null;

  if (!supabaseAdmin) {
    return (
      <ChatClient
        conversationId={conversationId}
        initialMessages={initialMessages}
        conversationContext={conversationContext}
        initialConsultantGreeting={initialConsultantGreeting}
      />
    );
  }

  try {
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .select('id, workspace_id, operating_profile_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationError) {
      console.error('Failed to load conversation context:', conversationError);
    }

    if (conversation?.workspace_id) {
      const { data: workspace } = await supabaseAdmin
        .from('workspaces')
        .select('id, name, default_operating_profile_id')
        .eq('id', conversation.workspace_id)
        .maybeSingle();

      conversationContext.workspaceId = workspace?.id ?? conversation.workspace_id;
      conversationContext.workspaceName = workspace?.name ?? null;
      conversationContext.operatingProfileId = conversation.operating_profile_id ?? workspace?.default_operating_profile_id ?? null;
    } else {
      conversationContext.operatingProfileId = conversation?.operating_profile_id ?? null;
    }

    if (conversationContext.operatingProfileId) {
      const { data: profile } = await supabaseAdmin
        .from('operating_profiles')
        .select('id, name, mode')
        .eq('id', conversationContext.operatingProfileId)
        .maybeSingle();

      conversationContext.operatingProfileId = profile?.id ?? conversationContext.operatingProfileId;
      conversationContext.operatingProfileName = profile?.name ?? null;
      conversationContext.operatingProfileMode = profile?.mode ?? null;
    }

    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to load initial messages:', error);
    } else {
      initialMessages = (messages || []).map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        text: msg.content,
        timestamp: new Date(msg.created_at).toISOString(),
        sources: [],
      }));
    }

    // Build onboarding-aware greeting when the conversation is fresh.
    const hasMessages = initialMessages.length > 0;
    const workspaceIdForGreeting = conversation?.workspace_id || conversationContext.workspaceId;
    if (!hasMessages && workspaceIdForGreeting) {
      const { data: domainIntentRow } = await supabaseAdmin
        .from('workspace_sources')
        .select('id, title')
        .eq('workspace_id', workspaceIdForGreeting)
        .eq('metadata->>kind', 'domain_intent')
        .maybeSingle();

      const { count: sourceCount } = await supabaseAdmin
        .from('workspace_sources')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceIdForGreeting);

      const hasDomainIntent = Boolean(domainIntentRow);
      const hasSources = typeof sourceCount === 'number' && sourceCount > 0;

      if (hasDomainIntent || hasSources) {
        const parts = [
          hasDomainIntent
            ? "I've initialized our workspace and processed the context you provided"
            : null,
          hasSources
            ? `through the Data Refinery${hasDomainIntent ? ';' : '.'} I'm fully calibrated to your domain constraints.`
            : hasDomainIntent
              ? '.'
              : null,
        ].filter(Boolean);

        if (parts.length > 0) {
          initialConsultantGreeting = `${parts.join(' ')} What specific analysis or strategy are we executing first?`;
        }
      }
    }
  } catch (err) {
    console.error('Exception loading conversation page data:', err);
  }

  return (
    <ChatClient
      conversationId={conversationId}
      initialMessages={initialMessages}
      conversationContext={conversationContext}
      initialConsultantGreeting={initialConsultantGreeting}
    />
  );
}
