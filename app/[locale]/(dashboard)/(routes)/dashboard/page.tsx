"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useGuestChatStore } from '@/lib/store/guest-chat-store';

export default function DashboardPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;

    const routeUser = async () => {
      try {
        const res = await fetch('/api/workspaces/default', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;

        const workspace = data?.workspace;
        if (!res.ok || !workspace || workspace.onboarding_state === 'starter') {
          router.replace(`/${locale}/onboarding`);
          return;
        }

        // Check for guest session to sync
        const guestStore = useGuestChatStore.getState();
        if (guestStore.messages.length > 0 && guestStore.guestSessionId) {
          try {
            const syncRes = await fetch('/api/chat/sync-guest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: guestStore.messages,
                guestSessionId: guestStore.guestSessionId
              })
            });
            const syncData = await syncRes.json();
            if (syncData.success) {
              guestStore.clearSession();
              if (syncData.conversationId) {
                // Route directly to the imported conversation
                router.replace(`/${locale}/workspaces/${workspace.id}/c/${syncData.conversationId}`);
                return;
              }
            }
          } catch (err) {
            console.error('Failed to sync guest session:', err);
          }
        }

        router.replace(`/${locale}/workspaces/${workspace.id}`);
      } catch {
        if (!cancelled) {
          router.replace(`/${locale}/onboarding`);
        }
      }
    };

    routeUser();
    return () => {
      cancelled = true;
    };
  }, [router, locale]);

  return null;
}
