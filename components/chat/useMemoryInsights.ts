"use client";

import { useEffect, useState } from "react";
import { useMemoryCount } from "./useMemoryCount";

interface UseMemoryInsightsOptions {
  /** Workspace ID used to scope the episodic-suggestion fetch. */
  workspaceId: string | null;
  /** Current message count — drives the pulse + count refresh. */
  messageCount: number;
  /** Initial message count (0 = fresh conversation) — gates the suggestion fetch. */
  initialMessageCount: number;
}

/**
 * Memory insights: episodic-memory prompt suggestion + memory-count badge.
 * The count/pulse lives in `useMemoryCount`; this adds the ephemeral
 * suggestion fetch on top.
 *
 * Extracted from conversation/[id]/client.tsx (T5). Read-only inputs — the
 * hook owns only its own state and never touches parent chat state.
 */
export function useMemoryInsights({
  workspaceId,
  messageCount,
  initialMessageCount,
}: UseMemoryInsightsOptions) {
  const { memoryCount, isMemoryPulsing } = useMemoryCount(messageCount);
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

  return {
    memoryCount,
    isMemoryPulsing,
    swarmSuggestion,
  };
}