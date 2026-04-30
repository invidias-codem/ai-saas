"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

export default function ConversationIndexPage() {
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
        if (!res.ok || !workspace) {
          router.replace(`/${locale}/conversation/new`);
          return;
        }

        router.replace(`/${locale}/workspaces/${workspace.id}/conversation`);
      } catch {
        if (!cancelled) {
          router.replace(`/${locale}/conversation/new`);
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
