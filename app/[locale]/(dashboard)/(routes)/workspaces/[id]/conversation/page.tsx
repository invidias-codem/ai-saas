import { redirect } from 'next/navigation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export default async function WorkspaceConversationPage({ params }: RouteParams) {
  const { id } = await params;
  redirect(`/conversation/new?workspaceId=${encodeURIComponent(id)}`);
}
