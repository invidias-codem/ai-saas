// components/runtime-indicator.tsx
"use client";

import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

type RuntimeState = "idle" | "busy" | "error";

const stateConfig: Record<RuntimeState, { label: string; color: string }> = {
  idle: {
    label: "Agent Ready",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  busy: {
    label: "Agent Busy",
    color: "text-amber-600 dark:text-amber-400",
  },
  error: {
    label: "Agent Error",
    color: "text-red-600 dark:text-red-400",
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
        "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-2 py-1 text-[10px] font-medium transition-all duration-300",
        className
      )}
      title={config.label}
    >
      <span
        className={cn(
          "relative flex h-1.5 w-1.5",
          state === "idle" && "text-emerald-500",
          state === "busy" && "text-amber-500",
          state === "error" && "text-red-500"
        )}
      >
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            state === "idle" && "bg-emerald-400 animate-ping",
            state === "busy" && "bg-amber-400 animate-pulse",
            state === "error" && "bg-red-400"
          )}
        />
        <span
          className={cn(
            "relative inline-flex rounded-full h-1.5 w-1.5",
            state === "idle" && "bg-emerald-500",
            state === "busy" && "bg-amber-500",
            state === "error" && "bg-red-500"
          )}
        />
      </span>
      <Activity className={cn("h-3 w-3", config.color)} />
      <span className={cn(config.color, "hidden sm:inline")}>
        {config.label}
      </span>
    </div>
  );
};
