"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Terminal, RefreshCcw, CheckCircle, AlertTriangle } from "lucide-react";

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

export function WorkspaceTelemetryViewer({ workspaceId }: { workspaceId: string }) {
  const [logs, setLogs] = useState<TelemetryEvent[]>([]);
  const [isActive, setIsActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Initial Fetch
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
    fetchRecent();

    // 2. Real-time Subscription
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
            setLogs((prev) => [...prev.slice(-100), newEvent]); // Keep last 100
          }
        }
      )
      .subscribe();

    // 3. Fallback Polling (in case Real-time RLS fails)
    const pollInterval = setInterval(() => {
      fetchRecent();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [workspaceId]);

  useEffect(() => {
    // Auto-scroll to bottom
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    
    // Check if ingestion is active
    if (logs.length > 0) {
      const lastEvent = logs[logs.length - 1];
      setIsActive(
        lastEvent.event_type === "ingestion_started" || 
        lastEvent.event_type === "ingestion_progress"
      );
    }
  }, [logs]);

  return (
    <div className="bg-slate-950 text-slate-300 font-mono text-xs rounded-lg border border-slate-800 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sky-400" />
          <span className="font-semibold text-sky-400">Agentic Brain Synchronization</span>
        </div>
        <div className="flex items-center gap-2">
          {isActive ? (
            <span className="flex items-center gap-1 text-amber-400">
              <RefreshCcw className="w-3 h-3 animate-spin" />
              Syncing...
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              Idle
            </span>
          )}
        </div>
      </div>
      
      <div className="p-4 h-64 overflow-y-auto space-y-2 relative">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic h-full flex items-center justify-center">
            Awaiting ingestion triggers...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3">
              <span className="text-slate-500 shrink-0">
                [{new Date(log.created_at).toLocaleTimeString()}]
              </span>
              
              <div className="flex-1">
                {log.event_type === "ingestion_started" && (
                  <span className="text-sky-300">Initiating local workspace scan at {log.path_accessed}...</span>
                )}
                {log.event_type === "ingestion_progress" && (
                  <span className="text-slate-300">
                    Extracted and chunked files in <span className="text-emerald-400">{log.path_accessed}</span>
                    {log.duration_ms && ` (${log.duration_ms}ms)`}
                  </span>
                )}
                {log.event_type === "ingestion_complete" && (
                  <span className="flex items-center gap-2 text-emerald-400 font-semibold mt-2">
                    <CheckCircle className="w-4 h-4" />
                    Synchronization completed successfully for {log.path_accessed}
                  </span>
                )}
                {log.event_type === "ingestion_failure" && (
                  <span className="flex items-center gap-2 text-red-400 font-semibold mt-2">
                    <AlertTriangle className="w-4 h-4" />
                    Synchronization failed: {log.error_message}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
