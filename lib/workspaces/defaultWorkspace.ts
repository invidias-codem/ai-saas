// lib/workspaces/defaultWorkspace.ts
// Shared find-or-create logic for a user's default workspace.
// Consumed by both the API route (app/api/workspaces/default/route.ts)
// and the server-side /dashboard redirect, so behavior stays identical.

import { ensureDefaultOperatingProfile } from '@/lib/workspaces/operatingProfiles';
import { attachOperatingProfiles } from '@/lib/workspaces/query';

export async function getDefaultWorkspace(userId: string) {
  const { supabaseAdmin } = await import('@/lib/supabaseClient');
  if (!supabaseAdmin) {
    throw new Error('Database configuration missing');
  }

  const defaultProfile = await ensureDefaultOperatingProfile(userId);

  let { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('workspaces')
      .insert({
        user_id: userId,
        name: 'My Workspace',
        slug: 'my-workspace',
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
    data = created;

    await supabaseAdmin.from('workspace_state').upsert({
      workspace_id: data.id,
      last_open_tab: 'overview',
    });
  }

  const [workspace] = await attachOperatingProfiles([data]);
  return workspace;
}
