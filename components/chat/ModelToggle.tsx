"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModelToggle({ disabled }: { disabled?: boolean }) {
  return (
    <div
      aria-label="General assistant mode"
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium text-foreground",
        disabled && "opacity-70"
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-sky-500" />
      <span>General</span>
    </div>
  );
}
