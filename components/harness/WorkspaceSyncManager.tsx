"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { WorkspaceTelemetryViewer } from "./WorkspaceTelemetryViewer";

interface RootGrant {
  id: string;
  path: string;
  label: string;
}

export function WorkspaceSyncManager({ workspaceId }: { workspaceId: string }) {
  const { getToken, userId } = useAuth();
  const [grants, setGrants] = useState<RootGrant[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  // Monotonic id for JSON-RPC calls (avoids Date.now() during render).
  const rpcSeq = useRef(0);

  useEffect(() => {
    async function fetchGrants() {
      const res = await fetch(`/api/workspaces/${workspaceId}/harness/grants`);
      if (res.ok) {
        const data = await res.json();
        setGrants(data);
      }
    }
    fetchGrants();
  }, [workspaceId]);

  const handleSync = async (path: string) => {
    setIsSyncing(true);
    try {
      const token = await getToken();
      
      const rpcPayload = {
        jsonrpc: "2.0",
        method: "start_workspace_ingestion",
        params: {
          path: path,
          workspace_id: workspaceId,
          user_id: userId,
          auth_token: token,
          api_base_url: window.location.origin,
        },
        id: ++rpcSeq.current,
      };

      const daemonRes = await fetch("http://127.0.0.1:4000/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcPayload),
      });

      if (!daemonRes.ok) {
        throw new Error("Failed to contact Go daemon for ingestion.");
      }
    } catch (err) {
      console.error("[SYNC_RPC_ERROR]", err);
    } finally {
      // We don't necessarily set isSyncing to false immediately if we rely on telemetry to show active state,
      // but freeing the button is fine since telemetry will show the progress.
      setTimeout(() => setIsSyncing(false), 2000);
    }
  };

  if (grants.length === 0) {
    return null; // Don't show the sync manager if there are no authorized roots
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Index Synchronization</h3>
          <p className="text-xs text-slate-500 max-w-md mt-1">
            Re-scan your authorized directories to update the AI&apos;s semantic memory. The ingestion process runs silently in the background daemon.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {grants.map((grant) => (
            <Button 
              key={grant.id} 
              size="sm" 
              variant="outline" 
              onClick={() => handleSync(grant.path)}
              disabled={isSyncing}
              className="gap-2 bg-white dark:bg-slate-950"
            >
              <Play className="w-3 h-3" />
              Sync {grant.label}
            </Button>
          ))}
        </div>
      </div>

      <WorkspaceTelemetryViewer workspaceId={workspaceId} />
    </div>
  );
}
