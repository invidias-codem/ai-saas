import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { PartnerKeysManager } from './PartnerKeysManager';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string }>;
}

export default async function PartnerKeysPage({ params }: RouteParams) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }
  if (!supabaseAdmin) {
    throw new Error('Supabase not configured');
  }

  // Parallel server prefetch — previously two client fetches after hydration.
  const [keysResult, workspacesResult] = await Promise.all([
    supabaseAdmin
      .from('partner_keys')
      .select('id, workspace_id, name, key_prefix, environment, scopes, rate_limit_per_min, revoked, last_used_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('workspaces')
      .select('id, name')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false }),
  ]);

  if (keysResult.error) {
    console.error('[settings/partner-keys] list error:', keysResult.error);
    throw keysResult.error;
  }
  if (workspacesResult.error) {
    console.error('[settings/partner-keys] workspaces error:', workspacesResult.error);
    throw workspacesResult.error;
  }

  return (
    <PartnerKeysManager
      initialKeys={keysResult.data ?? []}
      workspaces={workspacesResult.data ?? []}
    />
  );
}
