"use client";

import { Montserrat } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useSubscriptionStore } from "@/lib/store/subscription-store";

import { cn } from "@/lib/utils";
import { routes } from "@/app/constants";
import { ConversationHistory } from "@/components/conversation-history";
import { clearSessionMemoryStorage } from "@/lib/sessionClientMemory";

const montserrat = Montserrat({
  weight: "600",
  subsets: ["latin"],
});

interface SidebarProps {
  onNavigate?: () => void;
}

const Sidebar = ({ onNavigate }: SidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Sidebar");
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

  const handleClick = (href: string) => {
    if (onNavigate) onNavigate();
    router.push(localHref(href));
  };

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

  const maxCredits = 200;
  const creditsPercentage = Math.min(100, Math.max(0, (computeCredits / maxCredits) * 100));

  const isConversationRoute =
    pathname?.startsWith(localHref("/conversation")) ||
    pathname?.includes("/workspaces/");

  return (
    // Outer shell: full height, flex column, no overflow here
    <div className="flex flex-col h-full bg-background text-foreground">

      {/* ── Top: Logo + Nav routes ────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 py-4">
        {/* Logo */}
        <div
          className="flex items-center pl-3 mb-6 cursor-pointer"
          onClick={() => handleClick("/dashboard")}
        >
          <div className="relative w-8 h-8 mr-4">
            <Image fill alt="Logo" src="/Genie.png" sizes="32px" />
          </div>
          <h1 className={cn("text-2xl font-bold", montserrat.className)}>
            Genie
          </h1>
        </div>

        {/* Nav routes */}
        <div className="space-y-1">
          {routes.map((route) => (
            <div
              key={route.href}
              onClick={() => handleClick(route.href)}
              className={cn(
                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer rounded-lg transition",
                "hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10",
                pathname === localHref(route.href)
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10"
                  : "text-slate-500 dark:text-zinc-400"
              )}
            >
              <div className="flex items-center flex-1">
                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                {t(labelMap[route.label] || route.label)}
              </div>
            </div>
          ))}
        </div>

        {/* Conversation section divider + New Chat CTA (always visible on mobile) */}
        <div className="mt-5 border-t border-slate-200 dark:border-white/10 pt-4">
          <button
            type="button"
            onClick={handleNewChat}
            disabled={creatingNew}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5",
              "bg-sky-600 hover:bg-sky-700 active:bg-sky-800",
              "text-sm font-semibold text-white transition-all duration-150",
              "shadow-sm disabled:opacity-60"
            )}
          >
            <Plus className="h-4 w-4 flex-shrink-0" />
            {creatingNew ? "Starting…" : "New Chat"}
          </button>
        </div>
      </div>

      {/* ── Middle: Scrollable conversation history ──────────────── */}
      {/*
        flex-1 + min-h-0 is the critical pair:
        - flex-1 lets this div grow to fill remaining space
        - min-h-0 overrides the default min-height:auto so overflow-y-auto works
      */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        <ConversationHistory onNavigate={onNavigate} />
      </div>

      {/* ── Bottom: Credits widget ────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-slate-200 dark:border-white/10">
        <div
          className="bg-slate-100 dark:bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition"
          onClick={triggerPaywall}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center">
              <Zap className="w-3 h-3 mr-1 text-amber-500" />
              Premium Credits
            </span>
            <span className="text-xs font-bold text-slate-700 dark:text-zinc-200">
              {computeCredits}/{maxCredits}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-1.5">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                computeCredits > 50 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${creditsPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
