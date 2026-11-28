// components/sidebar.tsx
// Server wrapper for the dashboard sidebar. Prefetches the conversation list
// once per request (RSC payload) and hands it to the client shell. When the
// parent layout has already seeded the list (shared desktop+mobile prefetch),
// it forwards that seed instead of re-fetching. The client shell re-validates
// in-session via /api/conversations whenever a targeted invalidation event
// fires — avoiding the layout-stale-data trap.

import { getConversationsForUser, ConversationListItem } from '@/lib/conversations/list';
import SidebarClient from './SidebarClient';

interface SidebarProps {
  onNavigate?: () => void;
  initialConversations?: ConversationListItem[];
}

export default async function Sidebar({ onNavigate, initialConversations }: SidebarProps) {
  const { conversations } = initialConversations
    ? { conversations: initialConversations }
    : await getConversationsForUser();
  return <SidebarClient onNavigate={onNavigate} initialConversations={conversations} />;
}