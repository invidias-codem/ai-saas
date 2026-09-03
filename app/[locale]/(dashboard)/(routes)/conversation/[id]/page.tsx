import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
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

export default async function ConversationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id: conversationId } = await params;

  const { userId } = await auth();
  if (!userId) {
    redirect(`/${locale}/sign-in`);
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
    throw new Error('Supabase not configured');
  }

  // H2: ownership enforced at the query level — a conversation id that
  // doesn't belong to the authed user is indistinguishable from 404.
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from('conversations')
    .select('id, workspace_id, operating_profile_id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (conversationError) {
    console.error('Failed to load conversation context:', conversationError);
    notFound();
  }
  if (!conversation) {
    notFound();
  }

  // H1: independent lookups fire in parallel — historic serial waterfall
  // was: conversation -> workspace -> profile -> messages -> greeting probes.
  const messagesPromise = supabaseAdmin
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  const workspacePromise = conversation.workspace_id
    ? supabaseAdmin
        .from('workspaces')
        .select('id, name, default_operating_profile_id')
        .eq('id', conversation.workspace_id)
        .maybeSingle()
    : Promise.resolve({ data: null as any });

  const [
    { data: messages, error: messagesError },
    { data: workspace },
  ] = await Promise.all([messagesPromise, workspacePromise]);

  if (messagesError) {
    console.error('Failed to load initial messages:', messagesError);
  } else {
    initialMessages = (messages || []).map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      text: msg.content,
      timestamp: new Date(msg.created_at).toISOString(),
      sources: [],
    }));
  }

  conversationContext.workspaceId = workspace?.id ?? conversation.workspace_id ?? null;
  conversationContext.workspaceName = workspace?.name ?? null;
  conversationContext.operatingProfileId =
    conversation.operating_profile_id ?? workspace?.default_operating_profile_id ?? null;

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

  // Build onboarding-aware greeting when the conversation is fresh.
  const workspaceIdForGreeting = conversation.workspace_id || conversationContext.workspaceId;
  if (initialMessages.length === 0 && workspaceIdForGreeting) {
    const [domainIntentResult, sourceCountResult] = await Promise.all([
      supabaseAdmin
        .from('workspace_sources')
        .select('id, title')
        .eq('workspace_id', workspaceIdForGreeting)
        .eq('metadata->>kind', 'domain_intent')
        .maybeSingle(),
      supabaseAdmin
        .from('workspace_sources')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceIdForGreeting),
    ]);

    const hasDomainIntent = Boolean(domainIntentResult.data);
    const hasSources = typeof sourceCountResult.count === 'number' && sourceCountResult.count > 0;

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

  return (
    <ChatClient
      conversationId={conversationId}
      initialMessages={initialMessages}
      conversationContext={conversationContext}
      initialConsultantGreeting={initialConsultantGreeting}
    />
  );
}
