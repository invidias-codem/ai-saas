import { redirect } from 'next/navigation';

interface RouteParams {
  params: Promise<{ locale: string; id: string }>;
}

export const dynamic = 'force-dynamic';

// Bare workspace URLs jump straight to the conversation resolver.
// (workspace/[id]/conversation picks last-open or creates a new conversation.)
export default async function WorkspaceRedirect({ params }: RouteParams) {
  const { locale, id } = await params;
  redirect(`/${locale}/workspaces/${id}/conversation`);
}
