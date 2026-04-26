import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { ensureDefaultOperatingProfile } from '@/app/api/operating-profiles/route';

export const dynamic = 'force-dynamic';

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

    const defaultProfile = await ensureDefaultOperatingProfile(user.userId);

    let { data, error } = await supabaseAdmin
      .from('workspaces')
      .select('*, default_operating_profile:operating_profiles(*)')
      .eq('user_id', user.userId)
      .eq('is_default', true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { data: created, error: createError } = await supabaseAdmin
        .from('workspaces')
        .insert({
          user_id: user.userId,
          name: 'My Workspace',
          slug: 'my-workspace',
          description: 'Your default Tech Genie workspace',
          kind: 'personal',
          status: 'active',
          is_default: true,
          onboarding_state: 'starter',
          default_operating_profile_id: defaultProfile.id,
        })
        .select('*, default_operating_profile:operating_profiles(*)')
        .single();

      if (createError) throw createError;
      data = created;

      await supabaseAdmin.from('workspace_state').upsert({
        workspace_id: data.id,
        last_open_tab: 'overview',
      });
    }

    return NextResponse.json({ success: true, workspace: data });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[API:Workspaces:Default] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
