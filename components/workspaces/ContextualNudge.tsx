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
    <Card className={`p-5 sm:p-6 border-indigo-500/20 bg-indigo-500/5 ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hidden sm:block">
            <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
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
        <Link href={`/${locale}/settings/local-capabilities`} className="shrink-0">
          <Button variant="default" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            <Terminal className="w-4 h-4" />
            Go to Advanced Setup
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
