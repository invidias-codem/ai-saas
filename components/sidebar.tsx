// components/sidebar.tsx
// Server wrapper for the dashboard sidebar. Prefetches the conversation list
// once per request (RSC payload) and hands it to the client shell. The client
// shell re-validates in-session via /api/conversations whenever a targeted
// invalidation event fires — avoiding the layout-stale-data trap.

import { getConversationsForUser } from '@/lib/conversations/list';
import SidebarClient from './SidebarClient';

export default async function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { conversations } = await getConversationsForUser();
  return <SidebarClient onNavigate={onNavigate} initialConversations={conversations} />;
}
