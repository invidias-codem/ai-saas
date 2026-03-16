"use client";

import { Montserrat } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLocale } from "next-intl";

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

  // Build a locale-prefixed href so next-intl routing works correctly
  const localHref = (href: string) => `/${locale}${href}`;

  const handleClick = (href: string) => {
    if (onNavigate) {
      onNavigate();
    }
    router.push(localHref(href));
  };

  return (
    <div className="space-y-4 py-4 flex flex-col h-full bg-white dark:bg-[#111827] text-slate-900 dark:text-white">
      <div className="px-3 py-2 flex-1">
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
                // Compare against locale-prefixed path so active state is correct
                pathname === localHref(route.href)
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10"
                  : "text-slate-500 dark:text-zinc-400"
              )}
            >
              <div className="flex items-center flex-1">
                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                {route.label}
              </div>
            </div>
          ))}
        </div>

        {/* Conversation History Section */}
        <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-4 px-2">
          <ConversationHistory />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
