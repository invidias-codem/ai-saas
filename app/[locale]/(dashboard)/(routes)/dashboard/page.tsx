"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

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
