"use client";

import { Sparkles, Lock } from "lucide-react";
import { useSubscriptionStore } from "@/lib/store/subscription-store";
import { Button } from "@/components/ui/button";

export function ModelToggle({ disabled }: { disabled?: boolean }) {
  const { computeCredits, triggerPaywall } = useSubscriptionStore();
  const isLocked = computeCredits <= 0;
  return isLocked ? (
    <Button type="button" variant="outline" className="gap-1.5" onClick={triggerPaywall}>
      <Lock className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
      Premium Locked
    </Button>
  ) : (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-chrome px-3 py-1.5 text-sm font-medium text-foreground">
      <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <span className={disabled ? "text-muted-foreground" : undefined}>General</span>
    </div>
  );
}
