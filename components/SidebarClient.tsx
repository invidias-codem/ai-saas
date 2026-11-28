"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useSubscriptionStore } from "@/lib/store/subscription-store";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { routes } from "@/app/constants";
import { ConversationHistory } from "@/components/conversation-history";
import { clearSessionMemoryStorage } from "@/lib/sessionClientMemory";

export interface ConversationSeed { id: string; workspaceId?: string | null; title: string; messageCount: number; createdAt: number; lastUpdated: number; isArchived: boolean; preview?: string; }

export interface SidebarClientProps { onNavigate?: () => void; initialConversations: ConversationSeed[]; }

const SidebarClient = ({ onNavigate, initialConversations }: SidebarClientProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Sidebar");
  const { user } = useUser();
  const [creatingNew, setCreatingNew] = useState(false);

  const labelMap: Record<string, string> = {
    "Dashboard": "dashboard",
    "Workspaces": "workspaces",
    "Conversation": "conversation",
    "Image Generation": "imageGeneration",
    "Video Generation": "videoGeneration",
    "Music Generation": "musicGeneration",
    "Code Generation": "codeGeneration",
    "Code Builder ⚡": "codeBuilder",
    "Settings": "settings"
  };

  const localHref = (href: string) => `/${locale}${href}`;

  const handleNewChat = async () => {
    setCreatingNew(true);
    try {
      clearSessionMemoryStorage();
      if (onNavigate) onNavigate();
      router.push(localHref("/conversation/new"));
    } finally {
      setCreatingNew(false);
    }
  };

  const { computeCredits, setCredits, triggerPaywall } = useSubscriptionStore();

  useEffect(() => {
    fetch('/api/user/credits')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.computeCredits === 'number') {
          setCredits(data.computeCredits);
        }
      })
      .catch(console.error);
  }, [setCredits]);

  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";
  const avatarInitial = displayName.trim().charAt(0).toUpperCase() || "L";

  return (
    <div className="flex h-full min-h-0 flex-col bg-chrome font-sans text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <Link
          href={localHref("/dashboard")}
          onClick={onNavigate}
          className="mb-4 inline-flex items-center gap-2.5 rounded-lg px-2 py-1"
        >
          <Image width={32} height={32} alt="" src="/lattice-logo.png" className="rounded-md" />
          <span className="text-lg font-bold tracking-tight">Lattice OS</span>
        </Link>

        <nav aria-label="Workspace tools" className="mb-5 space-y-0.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleNewChat}
            disabled={creatingNew}
            className="mb-3 w-full justify-start gap-3 rounded-lg border-border bg-card px-3"
          >
            <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
            {creatingNew ? "Starting…" : "New chat"}
          </Button>
          {routes.filter(route => route.label !== "Conversation").map(route => {
            const href = localHref(route.href);
            const active = pathname === href;
            return (
              <Link
                key={route.href}
                href={href}
                prefetch={false}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent font-semibold text-accent-foreground ring-1 ring-inset ring-primary/25"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <route.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(labelMap[route.label] || route.label)}
              </Link>
            );
          })}
        </nav>

        <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">
          Recents
        </div>
        <ConversationHistory onNavigate={onNavigate} initialConversations={initialConversations} />
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent"
          onClick={triggerPaywall}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground" aria-hidden="true">
            {avatarInitial}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <span className="text-xs text-muted-foreground">{computeCredits} credits</span>
          </span>
          <Zap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default SidebarClient;
