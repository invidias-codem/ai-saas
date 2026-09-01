"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface TelemetryEvent {
  id: string;
  workspace_id: string;
  user_id: string;
  event_type: string;
  path_accessed: string | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  operation_type: string;
  created_at: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncResult: "success" | "failure" | "idle" | null;
  lastSyncedAt: Date | null;
  filesSyncedCount: number;
  lastError: string | null;
}

export function useWorkspaceSyncStatus(workspaceId: string): SyncStatus {
  const [logs, setLogs] = useState<TelemetryEvent[]>([]);
  const channelRef = useRef<any>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch recent ingestion events
  const fetchRecent = async () => {
    const { data, error } = await supabase
      .from("harness_telemetry_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("event_type", [
        "ingestion_started",
        "ingestion_progress",
        "ingestion_complete",
        "ingestion_failure"
      ])
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      setLogs(data.reverse());
    }
  };

  // Subscribe to realtime changes
  useEffect(() => {
    fetchRecent();

    const channel = supabase
      .channel(`telemetry_${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "harness_telemetry_events",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: any) => {
          const newEvent = payload.new as TelemetryEvent;
          if (newEvent.event_type.startsWith("ingestion_")) {
            setLogs((prev) => [...prev.slice(-100), newEvent]);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Fallback polling
    const pollInterval = setInterval(() => {
      fetchRecent();
    }, 5000);
    pollIntervalRef.current = pollInterval;

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [workspaceId]);

  // Derived state computed during render (no effect)
  const lastEvent = logs.length > 0 ? logs[logs.length - 1] : undefined;

  const isSyncing =
    lastEvent?.event_type === "ingestion_started" ||
    lastEvent?.event_type === "ingestion_progress";

  let lastSyncResult: SyncStatus["lastSyncResult"] = null;
  if (lastEvent?.event_type === "ingestion_complete") {
    lastSyncResult = lastEvent.success ? "success" : "failure";
  } else if (lastEvent?.event_type === "ingestion_failure") {
    lastSyncResult = "failure";
  } else if (logs.length > 0 && !isSyncing) {
    lastSyncResult = "idle";
  }

  const lastSyncedAt = lastEvent
    ? new Date(lastEvent.created_at)
    : null;

  // Count files synced in the last complete ingestion
  const filesSyncedCount = logs
    .filter(
      (log) =>
        log.event_type === "ingestion_progress" && log.path_accessed
    ).length;

  const lastError =
    lastEvent?.event_type === "ingestion_failure"
      ? lastEvent.error_message
      : null;

  return {
    isSyncing,
    lastSyncResult,
    lastSyncedAt,
    filesSyncedCount,
    lastError,
  };
}