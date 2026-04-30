export function buildBalancedCopilotProfile(userId: string) {
  return {
    user_id: userId,
    name: 'Balanced Copilot',
    slug: 'balanced-copilot',
    mode: 'copilot',
    description: 'A budget-aware default profile for fast conversation with balanced memory and selective premium escalation.',
    is_default: true,
    is_system_preset: true,
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
  };
}

export async function ensureDefaultOperatingProfile(userId: string) {
  const { supabaseAdmin } = await import('@/lib/supabaseClient');
  if (!supabaseAdmin) throw new Error('Database configuration missing');

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('operating_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error: createError } = await supabaseAdmin
    .from('operating_profiles')
    .insert(buildBalancedCopilotProfile(userId))
    .select()
    .single();

  if (createError) throw createError;
  return created;
}
