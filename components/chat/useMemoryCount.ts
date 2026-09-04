"use client";

import { useEffect, useState } from "react";
import axios from "axios";

/**
 * Memory-count badge state: fetches /api/memory/count on mount and after new
 * messages, with a transient "pulse" animation flag.
 *
 * Split out of `useMemoryInsights` (which adds the episodic-suggestion fetch on
 * top for the chat page). The code generator only needs the count, so it reuses
 * this lean hook without the suggestion baggage.
 */
export function useMemoryCount(messageCount: number) {
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [isMemoryPulsing, setIsMemoryPulsing] = useState(false);

  const fetchMemoryCount = async () => {
    try {
      const res = await axios.get("/api/memory/count");
      if (res.data.count !== undefined) {
        setMemoryCount(res.data.count);
      }
    } catch (err) {
      console.error("Failed to fetch memory count:", err);
    }
  };

  useEffect(() => {
    fetchMemoryCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger fetch on new message (bot response) + transient pulse
  useEffect(() => {
    if (messageCount > 0) {
      fetchMemoryCount();
      setIsMemoryPulsing(true);
      const timer = setTimeout(() => setIsMemoryPulsing(false), 2000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount]);

  return {
    memoryCount,
    isMemoryPulsing,
  };
}