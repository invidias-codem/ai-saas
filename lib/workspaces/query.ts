import { supabaseAdmin } from '@/lib/supabaseClient';

export async function attachOperatingProfiles<T extends { default_operating_profile_id?: string | null }>(
  workspaces: T[]
) {
  if (!supabaseAdmin || workspaces.length === 0) {
    return workspaces.map((workspace) => ({
      ...workspace,
      default_operating_profile: null,
    }));
  }

  const ids = Array.from(
    new Set(
      workspaces
        .map((workspace) => workspace.default_operating_profile_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  if (ids.length === 0) {
    return workspaces.map((workspace) => ({
      ...workspace,
      default_operating_profile: null,
    }));
  }

  const { data: profiles, error } = await supabaseAdmin
    .from('operating_profiles')
    .select('*')
    .in('id', ids);

  if (error) throw error;

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return workspaces.map((workspace) => ({
    ...workspace,
    default_operating_profile: workspace.default_operating_profile_id
      ? profileMap.get(workspace.default_operating_profile_id) || null
      : null,
  }));
}
