import { redirect } from 'next/navigation';

async function getDefaultWorkspaceId(): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/workspaces/default`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.workspace?.id ?? null;
  } catch {
    return null;
  }
}

export default async function ConversationIndexPage() {
  const workspaceId = await getDefaultWorkspaceId();
  if (workspaceId) {
    redirect(`/workspaces/${workspaceId}/conversation`);
  }
  redirect('/conversation/new');
}
