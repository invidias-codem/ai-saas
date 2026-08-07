import { supabaseAdmin } from '@/lib/supabaseClient';

export async function resolveOrgSecret(orgId: string, secretKey: string): Promise<string | null> {
  // Local/Single-Tenant Fallback
  if (process.env.NODE_ENV === 'development' && process.env[secretKey]) {
    return process.env[secretKey] as string;
  }

  // Multi-Tenant Resolution
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('organization_secrets')
    .select('secret_value')
    .eq('org_id', orgId)
    .eq('secret_key', secretKey)
    .maybeSingle();

  if (error || !data) return null;
  return data.secret_value;
}
