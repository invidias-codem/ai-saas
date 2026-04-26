import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  if (!supabaseAdmin) {
    redirect(`/${locale}/onboarding`);
  }

  const { data: defaultWorkspace } = await supabaseAdmin
    .from('workspaces')
    .select('id, onboarding_state')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (!defaultWorkspace || defaultWorkspace.onboarding_state === 'starter') {
    redirect(`/${locale}/onboarding`);
  }

  redirect(`/${locale}/workspaces/${defaultWorkspace.id}`);
}
