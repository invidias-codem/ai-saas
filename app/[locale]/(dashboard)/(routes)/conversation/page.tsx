import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getDefaultWorkspace } from '@/lib/workspaces/defaultWorkspace';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ locale: string }>;
}

export default async function ConversationIndexPage({ params }: RouteParams) {
  const { locale } = await params;
  const { userId } = await auth();

  if (!userId) {
    redirect(`/${locale}/sign-in`);
  }

  // Default workspace -> resolver (respects last-open unless it doesn't exist)
  const workspace = await getDefaultWorkspace(userId);
  redirect(`/${locale}/workspaces/${workspace.id}/conversation`);
}
