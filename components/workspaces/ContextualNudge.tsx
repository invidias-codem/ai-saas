"use client";

import { useLocale } from "next-intl";
import Link from "next/link";
import { Terminal, Shield, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHarnessHeartbeat } from "@/hooks/useHarnessHeartbeat";

interface ContextualNudgeProps {
  actionIntended?: string; // e.g. "global codebase search", "direct file mutation"
  className?: string;
}

export function ContextualNudge({ actionIntended, className = "" }: ContextualNudgeProps) {
  const { isDaemonRunning } = useHarnessHeartbeat();
  const locale = useLocale();

  // If the daemon is running, we don't need to upsell Tier 2 capabilities.
  if (isDaemonRunning) return null;

  return (
    <Card className={`border-border bg-card p-4 sm:p-5 ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-4">
          <div className="hidden shrink-0 rounded-lg bg-accent p-2 text-accent-foreground sm:block">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-base sm:text-lg">
              {actionIntended 
                ? `Unlock ${actionIntended} with Lattice Local` 
                : "Unlock deep codebase indexing with Lattice Local"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              {actionIntended 
                ? `Attach Lattice Local to execute ${actionIntended} across your entire filesystem instantly.`
                : "Connect your local filesystem directly to your workspace to enable the Swarm Orchestrator to read and write files locally. Set up in ~5 minutes."}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="shrink-0 gap-2 border-border bg-chrome">
          <Link href={`/${locale}/settings/local-capabilities`}>
            <Terminal className="h-4 w-4" aria-hidden="true" />
            Go to Advanced Setup
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
