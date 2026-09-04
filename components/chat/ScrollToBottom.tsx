"use client";

import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollToBottomProps {
  onClick: () => void;
  accent?: "indigo" | "green";
}

const ACCENTS = {
  indigo: "bg-indigo-600 hover:bg-indigo-700",
  green: "bg-green-600 hover:bg-green-700",
} as const;

/**
 * Floating scroll-to-bottom button. Purely presentational — keeps the
 * visibility state and scroll behavior in `useChatScroll`.
 */
export function ScrollToBottom({ onClick, accent = "indigo" }: ScrollToBottomProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-28 right-6 z-30 h-10 w-10 rounded-full text-white shadow-lg flex items-center justify-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2",
        ACCENTS[accent]
      )}
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="h-5 w-5" />
    </button>
  );
}