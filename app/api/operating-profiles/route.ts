import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { ensureDefaultOperatingProfile } from '@/lib/workspaces/operatingProfiles';

export const dynamic = 'force-dynamic';

const createOperatingProfileSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  mode: z.enum(['copilot', 'research', 'agentic', 'drafting', 'memory_native', 'custom']).default('custom'),
  costSensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  latencyPreference: z.enum(['fast', 'balanced', 'deep']).default('balanced'),
  memoryAggressiveness: z.enum(['light', 'balanced', 'strong']).default('balanced'),
  retrievalDepth: z.enum(['minimal', 'standard', 'deep']).default('standard'),
  toolUseLevel: z.enum(['none', 'limited', 'moderate', 'high']).default('limited'),
  premiumEscalationPolicy: z.enum(['rare', 'conditional', 'allowed', 'preferred']).default('conditional'),
  reviewBeforeAction: z.boolean().default(true),
  allowAgenticRuns: z.boolean().default(false),
  allowExternalActions: z.boolean().default(false),
  citationPreference: z.boolean().default(false),
  defaultOutputStyle: z.enum(['chat', 'report', 'brief', 'draft', 'checklist']).default('chat'),
  artifactBias: z.enum(['low', 'medium', 'high']).default('medium'),
  contextWindowBudget: z.enum(['small', 'medium', 'large']).default('medium'),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'profile';
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { supabaseAdmin } = await import('@/lib/supabaseClient');
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });
    }

    await ensureDefaultOperatingProfile(user.userId);

    const { data, error } = await supabaseAdmin
      .from('operating_profiles')
      .select('*')
      .eq('user_id', user.userId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, operatingProfiles: data || [] });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:OperatingProfiles:GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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
    const parsed = createOperatingProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid operating profile payload' }, { status: 400 });
    }

    const { supabaseAdmin } = await import('@/lib/supabaseClient');
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });
    }

    await ensureDefaultOperatingProfile(user.userId);

    const slugBase = slugify(parsed.data.name);
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabaseAdmin
        .from('operating_profiles')
        .select('id')
        .eq('user_id', user.userId)
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${slugBase}-${i + 2}`;
    }

    const profilePayload = {
      user_id: user.userId,
      name: parsed.data.name,
      slug,
      mode: parsed.data.mode,
      description: parsed.data.description || null,
      is_default: false,
      is_system_preset: false,
      cost_sensitivity: parsed.data.costSensitivity,
      latency_preference: parsed.data.latencyPreference,
      memory_aggressiveness: parsed.data.memoryAggressiveness,
      retrieval_depth: parsed.data.retrievalDepth,
      tool_use_level: parsed.data.toolUseLevel,
      premium_escalation_policy: parsed.data.premiumEscalationPolicy,
      review_before_action: parsed.data.reviewBeforeAction,
      allow_agentic_runs: parsed.data.allowAgenticRuns,
      allow_external_actions: parsed.data.allowExternalActions,
      citation_preference: parsed.data.citationPreference,
      default_output_style: parsed.data.defaultOutputStyle,
      artifact_bias: parsed.data.artifactBias,
      context_window_budget: parsed.data.contextWindowBudget,
    };

    const { data, error } = await supabaseAdmin
      .from('operating_profiles')
      .insert(profilePayload)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, operatingProfile: data });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:OperatingProfiles:POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
