"use client";

import { Montserrat } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useSubscriptionStore } from "@/lib/store/subscription-store";
import { WELCOME_CREDITS } from "@/lib/subscription/packs";

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

  const maxCredits = WELCOME_CREDITS;
  const creditsPercentage = Math.min(100, Math.max(0, (computeCredits / maxCredits) * 100));
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Account";
  const avatarInitial = displayName.trim().charAt(0).toUpperCase() || "L";

  return (
    // Outer shell: full height, flex column, matching Gemini's dark theme aesthetics
    <div className="flex flex-col h-full bg-[#1e1e1e] text-[#e3e3e3] font-sans">
      
      {/* ── Top: Logo ────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-5">
        <div
          className="flex items-center cursor-pointer mb-6"
          onClick={() => handleClick("/dashboard")}
        >
          <div className="relative w-6 h-6 mr-3">
            <Image fill alt="Logo" src="/lattice-logo.png" sizes="24px" />
          </div>
          <h1 className={cn("text-lg font-medium tracking-wide text-white", montserrat.className)}>
            Lattice
          </h1>
        </div>

        {/* ── Top Actions (New Chat) ────────────────────────────────── */}
        <div className="space-y-0.5 mb-6">
          <div
            onClick={handleNewChat}
            className={cn(
              "text-sm flex items-center px-3 py-2 w-full justify-start font-medium cursor-pointer rounded-full transition-colors",
              "hover:bg-white/10 text-[#e3e3e3]",
              creatingNew ? "opacity-70 pointer-events-none" : ""
            )}
          >
            <Plus className="h-4 w-4 mr-4 text-white" />
            {creatingNew ? "Starting…" : "New chat"}
          </div>
          
          {/* Main Routes mapped over */}
          {routes.filter(r => r.label !== "Conversation").map((route) => (
            <div
              key={route.href}
              onClick={() => handleClick(route.href)}
              className={cn(
                "text-sm flex items-center px-3 py-2 w-full justify-start font-medium cursor-pointer rounded-full transition-colors",
                pathname === localHref(route.href)
                  ? "bg-white/10 text-white"
                  : "hover:bg-white/10 text-[#e3e3e3]"
              )}
            >
              <route.icon className={cn("h-4 w-4 mr-4 text-[#e3e3e3]")} />
              {t(labelMap[route.label] || route.label)}
            </div>
          ))}
        </div>
      </div>

      {/* ── Middle: Scrollable conversation history ──────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
        <div className="text-[11px] font-semibold text-[#a0a0a0] px-2 mb-2 tracking-wider uppercase">
          Recents
        </div>
        <ConversationHistory onNavigate={onNavigate} />
      </div>

      {/* ── Bottom: Profile / Credits widget ────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-4 mt-2">
        <div
          className="bg-transparent rounded-2xl p-2 cursor-pointer hover:bg-white/5 transition flex items-center justify-between"
          onClick={triggerPaywall}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#2a5a2a] flex items-center justify-center text-[#90ee90] font-bold text-sm">
            {avatarInitial}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-[#e3e3e3]">
              {displayName}
              </span>
              <span className="text-xs text-[#a0a0a0] flex items-center gap-1">
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-sm">{computeCredits} credits</span>
              </span>
            </div>
          </div>
          <Zap className="w-4 h-4 text-[#a0a0a0] hover:text-white transition-colors" />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
