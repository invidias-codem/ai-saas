"use client";

import React from "react";
import { Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscriptionStore } from "@/lib/store/subscription-store";

export function ModelToggle({ disabled }: { disabled?: boolean }) {
  const { computeCredits, triggerPaywall } = useSubscriptionStore();
  const isLocked = computeCredits <= 0;
  const isEffectivelyDisabled = disabled || isLocked;

  return (
    <div
      aria-label={isLocked ? "Premium mode locked" : "General assistant mode"}
      onClick={() => isLocked && triggerPaywall()}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium text-foreground transition",
        isEffectivelyDisabled ? "opacity-70 cursor-pointer" : "",
        isLocked && "hover:bg-slate-200 dark:hover:bg-zinc-800"
      )}
    >
      {isLocked ? <Lock className="h-3.5 w-3.5 text-rose-500" /> : <Sparkles className="h-3.5 w-3.5 text-sky-500" />}
      <span>{isLocked ? "Premium Locked" : "General"}</span>
    </div>
  );
}
