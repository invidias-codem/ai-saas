"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";

export default function WorkspaceHomePage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const workspaceId = String(params?.id || '');

  useEffect(() => {
    if (workspaceId) {
      router.replace(`/${locale}/workspaces/${workspaceId}/conversation`);
    }
  }, [workspaceId, locale, router]);

  return null;
}
