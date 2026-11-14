"use client";

import { cn } from "@/lib/utils";

interface MemoryInsightsProps {
  memoryCount: number;
  isMemoryPulsing: boolean;
  /** Compact desktop header style (pulsing dot + count) vs. mobile sheet style. */
  variant: "compact" | "mobile";
  accent?: "indigo" | "green";
}

const ACCENTS = {
  indigo: {
    dot: "bg-primary",
    pulsing: "text-primary",
  },
  green: {
    dot: "bg-green-500",
    pulsing: "text-green-500",
  },
} as const;

/**
 * Memory-count badge. Presentational only — state/fetching lives in
 * `useMemoryCount`/`useMemoryInsights`. Two layout variants share the count
 * display and use the workspace accent by default.
 */
export function MemoryInsights({
  memoryCount,
  isMemoryPulsing,
  variant,
  accent = "indigo",
}: MemoryInsightsProps) {
  const c = ACCENTS[accent];

  if (variant === "mobile") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("w-2 h-2 rounded-full", c.dot)} />
        {memoryCount} memories
      </div>
    );
  }

  return (
    <div
      className={cn(
        "text-[10px] text-muted-foreground transition-all duration-300 flex items-center gap-1",
        isMemoryPulsing && cn("font-bold scale-105", c.pulsing)
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full", c.dot, isMemoryPulsing && "motion-safe:animate-ping")}
      />
      {memoryCount} memories
    </div>
  );
}
