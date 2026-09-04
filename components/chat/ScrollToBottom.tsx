"use client";

import { ArrowDown } from "lucide-react";

interface ScrollToBottomProps {
  onClick: () => void;
}

/**
 * Floating scroll-to-bottom button. Purely presentational — keeps the
 * visibility state and scroll behavior in `useChatScroll`.
 */
export function ScrollToBottom({ onClick }: ScrollToBottomProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-28 right-6 z-30 h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="h-5 w-5" />
    </button>
  );
}