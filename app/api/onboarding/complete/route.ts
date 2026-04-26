import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

const onboardingSchema = z.object({
  workIntent: z.enum(['copilot', 'research', 'agentic', 'drafting', 'memory_native', 'coding']),
  operatingMode: z.enum(['copilot', 'research', 'agentic', 'drafting', 'memory_native']),
  priorities: z.array(z.enum(['lower_cost', 'faster_responses', 'deeper_reasoning', 'stronger_memory', 'more_automation', 'more_control_review'])).max(2),
  workspaceName: z.string().min(1).max(80),
  workspaceDescription: z.string().max(280).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'profile';
}

function buildProfileConfig(mode: z.infer<typeof onboardingSchema>['operatingMode'], priorities: string[]) {
  const base = {
    mode,
    cost_sensitivity: 'medium',
    latency_preference: 'balanced',
    memory_aggressiveness: 'balanced',
    retrieval_depth: 'standard',
    tool_use_level: 'limited',
    premium_escalation_policy: 'conditional',
    review_before_action: true,
    allow_agentic_runs: false,
    allow_external_actions: false,
    citation_preference: false,
    default_output_style: 'chat',
    artifact_bias: 'medium',
    context_window_budget: 'medium',
  } as Record<string, string | boolean>;

  if (mode === 'research') {
    base.retrieval_depth = 'deep';
    base.citation_preference = true;
    base.default_output_style = 'report';
    base.context_window_budget = 'large';
  }
  if (mode === 'agentic') {
    base.tool_use_level = 'moderate';
    base.allow_agentic_runs = true;
    base.default_output_style = 'checklist';
    base.artifact_bias = 'high';
  }
  if (mode === 'drafting') {
    base.default_output_style = 'draft';
    base.artifact_bias = 'high';
  }
  if (mode === 'memory_native') {
    base.memory_aggressiveness = 'strong';
    base.default_output_style = 'brief';
  }

  if (priorities.includes('lower_cost')) {
    base.cost_sensitivity = 'high';
    base.premium_escalation_policy = 'rare';
  }
  if (priorities.includes('faster_responses')) {
    base.latency_preference = 'fast';
    base.context_window_budget = 'small';
  }
  if (priorities.includes('deeper_reasoning')) {
    base.latency_preference = 'deep';
    base.premium_escalation_policy = 'allowed';
    base.context_window_budget = 'large';
  }
  if (priorities.includes('stronger_memory')) {
    base.memory_aggressiveness = 'strong';
    base.retrieval_depth = 'deep';
  }
  if (priorities.includes('more_automation')) {
    base.allow_agentic_runs = true;
    base.tool_use_level = 'high';
  }
  if (priorities.includes('more_control_review')) {
    base.review_before_action = true;
    base.allow_external_actions = false;
  }

  return base;
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid onboarding payload' }, { status: 400 });
    }

    const { supabaseAdmin } = await import('@/lib/supabaseClient');
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });
    }

    const { workIntent, operatingMode, priorities, workspaceName, workspaceDescription } = parsed.data;
    const profileConfig = buildProfileConfig(operatingMode, priorities);

    const profileName = `${workspaceName} ${operatingMode === 'copilot' ? 'Copilot' : 'Profile'}`;
    const profileSlug = slugify(profileName);

    const { data: existingDefault } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('user_id', user.userId)
      .eq('is_default', true)
      .maybeSingle();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('operating_profiles')
      .insert({
        user_id: user.userId,
        name: profileName,
        slug: profileSlug,
        mode: operatingMode,
        description: `Generated from onboarding for ${workIntent}`,
        is_default: !existingDefault,
        is_system_preset: false,
        ...profileConfig,
      })
      .select()
      .single();

    if (profileError) throw profileError;

    const workspaceSlug = slugify(workspaceName);
    const { data: workspace, error: workspaceError } = await supabaseAdmin
      .from('workspaces')
      .insert({
        user_id: user.userId,
        name: workspaceName,
        slug: workspaceSlug,
        description: workspaceDescription || null,
        kind: workIntent === 'coding' ? 'project' : workIntent === 'research' ? 'research' : 'personal',
        status: 'active',
        is_default: !existingDefault,
        onboarding_state: 'configured',
        default_operating_profile_id: profile.id,
      })
      .select()
      .single();

    if (workspaceError) throw workspaceError;

    await supabaseAdmin.from('workspace_state').upsert({
      workspace_id: workspace.id,
      last_open_tab: 'overview',
    });

    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .insert({
        user_id: user.userId,
        workspace_id: workspace.id,
        operating_profile_id: profile.id,
        title: `Welcome to ${workspaceName}`,
        is_deleted: false,
        is_archived: false,
      })
      .select()
      .single();

    if (conversationError) throw conversationError;

    await supabaseAdmin.from('workspace_state').upsert({
      workspace_id: workspace.id,
      last_open_conversation_id: conversation.id,
      last_open_tab: 'overview',
    });

    return NextResponse.json({
      success: true,
      workspace,
      operatingProfile: profile,
      conversation,
      redirectTo: `/workspaces/${workspace.id}`,
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:Onboarding:Complete] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
