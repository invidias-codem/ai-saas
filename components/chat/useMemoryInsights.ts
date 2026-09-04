"use client";

import { useEffect, useState } from "react";
import axios from "axios";

interface UseMemoryInsightsOptions {
  /** Workspace ID used to scope the episodic-suggestion fetch. */
  workspaceId: string | null;
  /** Current message count — drives the pulse + count refresh. */
  messageCount: number;
  /** Initial message count (0 = fresh conversation) — gates the suggestion fetch. */
  initialMessageCount: number;
}

/**
 * Memory insights: episodic-memory prompt suggestion + memory-count badge,
 * with a transient "pulse" animation after new messages.
 *
 * Extracted from conversation/[id]/client.tsx (T5). Read-only inputs — the
 * hook owns only its own state and never touches parent chat state.
 */
export function useMemoryInsights({
  workspaceId,
  messageCount,
  initialMessageCount,
}: UseMemoryInsightsOptions) {
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [isMemoryPulsing, setIsMemoryPulsing] = useState(false);
  const [swarmSuggestion, setSwarmSuggestion] = useState<string>("");

  // Asynchronously fetch episodic memory suggestion (fresh conversations only)
  useEffect(() => {
    const fetchSuggestion = async () => {
      try {
        const res = await fetch(`/api/memory/episodic?workspaceId=${workspaceId || ""}`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestion) {
            setSwarmSuggestion(data.suggestion);
          }
        }
      } catch (e) {
        // Fail silently to avoid interrupting the UX
      }
    };

    if (initialMessageCount === 0) {
      fetchSuggestion();
    }
  }, [workspaceId, initialMessageCount]);

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
    swarmSuggestion,
  };
}