import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { ensureDefaultOperatingProfile } from '@/lib/workspaces/operatingProfiles';
import { attachOperatingProfiles } from '@/lib/workspaces/query';
import { audit } from '@/lib/security/auditLog';

export const dynamic = 'force-dynamic';

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  kind: z.enum(['personal', 'project', 'research', 'operations', 'social', 'custom']).optional(),
  defaultOperatingProfileId: z.string().uuid().optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'workspace';
}

async function ensureDefaultWorkspace(userId: string) {
  const { supabaseAdmin } = await import('@/lib/supabaseClient');
  if (!supabaseAdmin) throw new Error('Database configuration missing');

  const defaultProfile = await ensureDefaultOperatingProfile(userId);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const baseName = 'My Workspace';
  const slug = 'my-workspace';

  const { data: created, error: createError } = await supabaseAdmin
    .from('workspaces')
    .insert({
      user_id: userId,
      name: baseName,
      slug,
      description: 'Your default Tech Genie workspace',
      kind: 'personal',
      status: 'active',
      is_default: true,
      onboarding_state: 'starter',
      default_operating_profile_id: defaultProfile.id,
    })
    .select('*')
    .single();

  if (createError) throw createError;

  await supabaseAdmin.from('workspace_state').upsert({
    workspace_id: created.id,
    last_open_tab: 'overview',
  });

  await supabaseAdmin.from('workspace_members').upsert({
    workspace_id: created.id,
    user_id: userId,
    role: 'owner',
    accepted_at: new Date().toISOString(),
  }, { onConflict: 'workspace_id,user_id' });

  return created;
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

    await ensureDefaultWorkspace(user.userId);

    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .select('*')
      .eq('user_id', user.userId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const workspaces = await attachOperatingProfiles(data || []);

    return NextResponse.json({ success: true, workspaces });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:Workspaces:GET] Error:', error);
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
    const parsed = createWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid workspace payload' }, { status: 400 });
    }

    const { name, description, kind = 'custom', defaultOperatingProfileId } = parsed.data;
    const { supabaseAdmin } = await import('@/lib/supabaseClient');
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 });
    }

    await ensureDefaultWorkspace(user.userId);
    const fallbackProfile = await ensureDefaultOperatingProfile(user.userId);

    const slugBase = slugify(name);
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabaseAdmin
        .from('workspaces')
        .select('id')
        .eq('user_id', user.userId)
        .eq('slug', slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${slugBase}-${i + 2}`;
    }

    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .insert({
        user_id: user.userId,
        name,
        slug,
        description: description || null,
        kind,
        status: 'active',
        is_default: false,
        onboarding_state: 'starter',
        default_operating_profile_id: defaultOperatingProfileId || fallbackProfile.id,
      })
      .select('*')
      .single();

    if (error) throw error;

    await supabaseAdmin.from('workspace_state').upsert({
      workspace_id: data.id,
      last_open_tab: 'overview',
    });

    await supabaseAdmin.from('workspace_members').upsert({
      workspace_id: data.id,
      user_id: user.userId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,user_id' });

    void audit('workspace.create', user.userId, {
      workspaceId: data.id,
      role: 'owner',
      kind,
      defaultOperatingProfileId: defaultOperatingProfileId || fallbackProfile.id,
    }, req);

    const [workspace] = await attachOperatingProfiles([data]);

    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:Workspaces:POST] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
