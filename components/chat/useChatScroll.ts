"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chat scroll management: auto-scroll refs, manual scroll-to-bottom, and the
 * "scrolled up" detection that shows/hides the floating ScrollToBottom button.
 *
 * Extracted from conversation/[id]/client.tsx (T1 — leaf slice, no edges).
 */
export function useChatScroll(messageCount: number) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Scroll to bottom for manual trigger
  const scrollToBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  // Track scroll position to show/hide the scroll-to-bottom button
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Show button when scrolled up more than 200px from bottom
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 200;
      setShowScrollButton(isScrolledUp && messageCount > 2);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [messageCount]);

  return {
    bottomRef,
    chatContainerRef,
    scrollToBottom,
    showScrollButton,
  };
}