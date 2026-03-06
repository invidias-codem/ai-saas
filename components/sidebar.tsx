"use client";

import { Montserrat } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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

  const handleClick = (href: string) => {
    if (onNavigate) {
      onNavigate();
    }
    // Programmatically navigate to ensure it works on mobile
    router.push(href);
  };

  return (
    <div className="space-y-4 py-4 flex flex-col h-full bg-[#111827] text-white">
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
                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                pathname === route.href
                  ? "text-white bg-white/10"
                  : "text-zinc-400"
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
        <div className="mt-6 border-t border-white/10 pt-4 px-2">
          <ConversationHistory />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
