// components/runtime-indicator.tsx
"use client";

import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

type RuntimeState = "idle" | "busy" | "error";

const stateConfig: Record<RuntimeState, { label: string; color: string }> = {
  idle: {
    label: "Agent Ready",
    color: "text-primary",
  },
  busy: {
    label: "Agent Busy",
    color: "text-warning",
  },
  error: {
    label: "Agent Error",
    color: "text-destructive",
  },
};

export const RuntimeIndicator = ({
  state = "idle",
  className,
}: {
  state?: RuntimeState;
  className?: string;
}) => {
  const config = stateConfig[state];

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-[10px] font-medium transition-colors",
        config.color,
        className
      )}
      title={config.label}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        {state === "busy" && (
          <span className="absolute inset-0 rounded-full bg-current opacity-75 motion-safe:animate-ping" />
        )}
        <span className="h-full w-full rounded-full bg-current" />
      </span>
      <Activity className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{config.label}</span>
    </div>
  );
};
