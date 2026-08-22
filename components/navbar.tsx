"use client";

import { UserButton } from "@clerk/nextjs";
import MobileSidebar from "./mobile-sidebar";
import { MemoryIndicator } from "./memory-indicator";
import { CreditDisplay } from "@/components/credit-display";
import { RuntimeIndicator } from "@/components/runtime-indicator";
import LanguageSwitcher from "@/components/language-switcher";
import { useTranslations } from "next-intl";
import { useRuntimeStore } from "@/lib/store/runtimeStore";

const Navbar = () => {
  const t = useTranslations("Navbar");
  const { loading, streaming, error, pendingApproval } = useRuntimeStore();

  const runtimeState = error ? 'error' : loading || streaming ? 'busy' : 'idle';

  return (
    <div className="flex items-center px-3 py-2 sm:px-4 sm:py-3 gap-2">
      {/* Left: Mobile toggle */}
      <MobileSidebar />

      {/* Right: Actions — responsive priority layout */}
      <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2 overflow-hidden">
        {/* Memory indicator: hidden on mobile, visible md+ */}
        <div className="hidden md:flex shrink-0">
          <MemoryIndicator />
        </div>

        {/* Credit counter: hidden on mobile, visible sm+ */}
        <div className="hidden sm:flex shrink-0">
          <CreditDisplay />
        </div>

        {/* Runtime indicator — always visible, compact on mobile */}
        <RuntimeIndicator state={runtimeState as "idle" | "busy" | "error"} />

        {/* Pending approval badge: hidden on mobile */}
        {pendingApproval && (
          <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 animate-pulse">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-amber-400 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
            </span>
            Approval needed
          </span>
        )}

        {/* Language switcher: hidden on mobile */}
        <div className="hidden md:flex shrink-0">
          <LanguageSwitcher />
        </div>

        {/* User avatar — always visible */}
        <UserButton afterSignOutUrl="/" />
      </div>
    </div>
  );
};

export default Navbar;
