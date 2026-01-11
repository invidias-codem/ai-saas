import { redirect } from 'next/navigation';

/**
 * Base Conversation Route
 * Redirects to /conversation/new to create a new conversation
 */
export default function ConversationIndexPage() {
  redirect('/conversation/new');
}