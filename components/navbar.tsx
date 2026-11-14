"use client";

import { UserButton } from "@clerk/nextjs";
import MobileSidebar from "./mobile-sidebar";
import { MemoryIndicator } from "./memory-indicator";
import { CreditDisplay } from "@/components/credit-display";
import { RuntimeIndicator } from "@/components/runtime-indicator";
import LanguageSwitcher from "@/components/language-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { useRuntimeStore } from "@/lib/store/runtimeStore";
import type { ConversationSeed } from "@/components/SidebarClient";

interface NavbarProps {
  initialConversations?: ConversationSeed[];
}

const Navbar = ({ initialConversations = [] }: NavbarProps) => {
  const { loading, streaming, error, pendingApproval } = useRuntimeStore();

  const runtimeState = error ? 'error' : loading || streaming ? 'busy' : 'idle';

  return (
    <div className="flex min-h-13 items-center gap-2 border-b border-border bg-chrome px-3 py-2 sm:px-4 sm:py-3">
      {/* Left: Mobile toggle */}
      <MobileSidebar initialConversations={initialConversations} />

      {/* Right: Actions — responsive priority layout */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {/* Memory indicator: hidden on mobile, visible md+ */}
        <div className="hidden shrink-0 lg:flex">
          <MemoryIndicator />
        </div>

        {/* Credit counter + top-up: always visible, compact on mobile */}
        <CreditDisplay />

        {/* Runtime indicator — always visible, compact on mobile */}
        <RuntimeIndicator state={runtimeState} />

        {/* Pending approval badge: hidden on mobile */}
        {pendingApproval && (
          <span className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning-surface px-2 py-1 text-[10px] font-medium text-warning md:inline-flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            Approval needed
          </span>
        )}

        {/* Language switcher: hidden on mobile */}
        <div className="hidden md:flex shrink-0">
          <LanguageSwitcher />
        </div>

        <ModeToggle />
        <UserButton afterSignOutUrl="/" />
      </div>
    </div>
  );
};

export default Navbar;
