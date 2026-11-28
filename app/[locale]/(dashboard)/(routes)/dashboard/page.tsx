import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getDefaultWorkspace } from '@/lib/workspaces/defaultWorkspace';
import { GuestSyncRouter } from './GuestSyncRouter';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: RouteParams) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  // Guest-sync bridge: the client store lives in localStorage, invisible to the
  // server. The guest chat store flags a cookie on the first message so we mount
  // the client sync router ONLY when there is actually local state to sync.
  const cookieStore = await cookies();
  if (cookieStore.get('pending_guest_sync')) {
    return <GuestSyncRouter />;
  }

  // find-or-create via shared helper; a fresh user lands at onboarding.
  // DB/infra failures throw through to error.tsx instead of masquerading
  // as a missing workspace (which used to bounce users into onboarding).
  const workspace = await getDefaultWorkspace(userId);

  if (workspace.onboarding_state === 'starter') {
    redirect(`/${locale}/onboarding`);
  }

  // Route straight to the conversation resolver — no client middleman hop.
  redirect(`/${locale}/workspaces/${workspace.id}/conversation`);
}
