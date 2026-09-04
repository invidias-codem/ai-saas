"use client";

import { cn } from "@/lib/utils";

interface MemoryInsightsProps {
  memoryCount: number;
  isMemoryPulsing: boolean;
  /** Compact desktop header style (pulsing dot + count) vs. mobile sheet style. */
  variant: "compact" | "mobile";
}

/**
 * Memory-count badge. Presentational only — state/fetching lives in
 * `useMemoryInsights`. Two layout variants share the count display.
 */
export function MemoryInsights({
  memoryCount,
  isMemoryPulsing,
  variant,
}: MemoryInsightsProps) {
  if (variant === "mobile") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-indigo-500" />
        {memoryCount} memories
      </div>
    );
  }

  return (
    <div
      className={cn(
        "text-[10px] text-muted-foreground transition-all duration-300 flex items-center gap-1",
        isMemoryPulsing && "text-indigo-500 font-bold scale-105"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full bg-indigo-500",
          isMemoryPulsing && "animate-ping"
        )}
      />
      {memoryCount} memories
    </div>
  );
}