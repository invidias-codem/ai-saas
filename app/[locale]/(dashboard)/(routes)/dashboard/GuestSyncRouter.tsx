"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

import { useGuestChatStore } from '@/lib/store/guest-chat-store';

const SYNC_COOKIE = 'pending_guest_sync';

function clearSyncCookie() {
  document.cookie = `${SYNC_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function GuestSyncRouter() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;

    const bounceToDashboard = () => {
      clearSyncCookie();
      // Cookie gone: the server component re-runs and does the fast redirect.
      router.replace(`/${locale}/dashboard`);
    };

    const syncGuestData = async () => {
      const { messages, guestSessionId } = useGuestChatStore.getState();

      // Cookie set but store empty (e.g. cleared storage) — nothing to do.
      if (!guestSessionId || messages.length === 0) {
        bounceToDashboard();
        return;
      }

      try {
        const res = await fetch('/api/chat/sync-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, guestSessionId }),
        });

        if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

        const data = await res.json();
        if (cancelled) return;

        // Only clear local state AFTER a confirmed 200. If anything above
        // throws, localStorage + cookie stay intact and the next visit retries.
        useGuestChatStore.getState().clearSession();
        clearSyncCookie();

        if (data.conversationId) {
          // Canonical conversation route: /{locale}/conversation/{id}
          router.replace(`/${locale}/conversation/${data.conversationId}`);
          return;
        }

        bounceToDashboard();
      } catch (err) {
        console.error('[GuestSyncRouter] Sync failed:', err);
        if (!cancelled) bounceToDashboard();
      }
    };

    syncGuestData();
    return () => {
      cancelled = true;
    };
  }, [router, locale]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Saving your conversation&hellip;
      </p>
    </div>
  );
}
