"use client";

import { Montserrat } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { MessageSquare, Plus, Zap } from "lucide-react";
import { useEffect } from "react";
import { useSubscriptionStore } from "@/lib/store/subscription-store";

import { cn } from "@/lib/utils";
import { routes } from "@/app/constants";
import { ConversationHistory } from "@/components/conversation-history";

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
    if (onNavigate) {
      onNavigate();
    }
    router.push(localHref(href));
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


  const isHistoryRoute = pathname?.startsWith(localHref("/conversation")) || pathname?.includes("/workspaces/");

  return (
    <div className="space-y-4 py-4 flex flex-col h-full bg-white dark:bg-[#111827] text-foreground">
      <div className="px-3 py-2 flex-1 flex flex-col min-h-0">
        <div
          className="flex items-center pl-3 mb-14 cursor-pointer"
          onClick={() => handleClick("/dashboard")}
        >
          <div className="relative w-8 h-8 mr-4">
            <Image fill alt="Logo" src="/Genie.png" sizes="(max-width: 768px) 32px, 80px" />
          </div>
          <h1 className={cn("text-2xl font-bold", montserrat.className)}>
            Genie
          </h1>
        </div>

        <div className="space-y-1">
          {routes.map((route) => (
            <div
              key={route.href}
              onClick={() => handleClick(route.href)}
              className={cn(
                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition",
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

        <div className="mt-auto pt-4">
          <div className="md:hidden border-t border-slate-200 dark:border-white/10 pt-4 space-y-3 px-2">
            <button
              type="button"
              onClick={() => handleClick("/conversation")}
              className={cn(
                "w-full flex items-center justify-start gap-3 rounded-lg px-3 py-3 text-sm font-medium transition",
                isHistoryRoute
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
              )}
            >
              <MessageSquare className="h-5 w-5 text-sky-500" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => handleClick("/conversation/new")}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
            </button>
          </div>

          <div className="hidden md:block mt-6 border-t border-slate-200 dark:border-white/10 pt-4 px-2">
            <ConversationHistory />
          </div>

          <div className="mt-4 px-3 mb-2">
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
              <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-2">
                <div 
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    computeCredits > 50 ? "bg-amber-500" : "bg-rose-500"
                  )}
                  style={{ width: `${creditsPercentage}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
