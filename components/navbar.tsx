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
      <div className="flex items-center p-4">
          <MobileSidebar />
          <div className="flex w-full items-center justify-end gap-x-2">
              <MemoryIndicator />
              <CreditDisplay />
              <RuntimeIndicator state={runtimeState as "idle" | "busy" | "error"} />
              {pendingApproval && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 animate-pulse">
                      <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-amber-400 animate-ping" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                      </span>
                      Approval needed
                  </span>
              )}
              <div className="flex items-center gap-x-2">
                  <LanguageSwitcher />
                  <UserButton afterSignOutUrl="/" />
              </div>
          </div>
      </div>
  );
};

export default Navbar;
