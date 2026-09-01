"use client";

import { cn } from "@/lib/utils";
import { RefreshCw, CheckCircle2, AlertCircle, HardDrive, Clock } from "lucide-react";

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncResult: "success" | "failure" | "idle" | null;
  lastSyncedAt: Date | null;
  filesSyncedCount: number;
  lastError: string | null;
}

interface SyncStatusIndicatorProps {
  syncStatus: SyncStatus;
  variant?: "compact" | "detailed";
  className?: string;
}

export function SyncStatusIndicator({
  syncStatus,
  variant = "compact",
  className,
}: SyncStatusIndicatorProps) {
  const { isSyncing, lastSyncResult, lastSyncedAt, filesSyncedCount, lastError } =
    syncStatus;

  // Determine display state
  let StatusIcon = HardDrive;
  let statusColor = "text-slate-500 dark:text-slate-400";
  let statusLabel = "Not synced";
  let showPulse = false;

  if (isSyncing) {
    StatusIcon = RefreshCw;
    statusColor = "text-amber-600 dark:text-amber-400";
    statusLabel = "Syncing…";
    showPulse = true;
  } else if (lastSyncResult === "success") {
    StatusIcon = CheckCircle2;
    statusColor = "text-emerald-600 dark:text-emerald-400";
    statusLabel = lastSyncedAt
      ? `Synced ${lastSyncedAt.toLocaleTimeString()}`
      : "Synced";
  } else if (lastSyncResult === "failure") {
    StatusIcon = AlertCircle;
    statusColor = "text-red-600 dark:text-red-400";
    statusLabel = lastError ? `Failed: ${lastError}` : "Sync failed";
  } else if (lastSyncResult === "idle") {
    StatusIcon = HardDrive;
    statusColor = "text-slate-500 dark:text-slate-400";
    statusLabel = "Idle";
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all duration-300",
          statusColor,
          "border-current/20 bg-current/5",
          className
        )}
        title={statusLabel}
      >
        <StatusIcon
          className={cn(
            "h-3 w-3 flex-shrink-0",
            showPulse && "animate-spin"
          )}
        />
        <span className="truncate max-w-[120px]">{statusLabel}</span>
        {filesSyncedCount > 0 && lastSyncResult === "success" && (
          <span className="text-muted-foreground ml-1">
            · {filesSyncedCount} file{filesSyncedCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    );
  }

  // Detailed variant for Local Capabilities page
  return (
    <div
      className={cn(
        "space-y-3 p-4 rounded-lg border bg-slate-50 dark:bg-slate-900/50",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "p-2 rounded-lg flex-shrink-0",
            statusColor.replace("text-", "bg-").replace("600", "100").replace("400", "900/30")
          )}
        >
          <StatusIcon
            className={cn(
              "h-5 w-5",
              showPulse && "animate-spin"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn("font-semibold", statusColor)}>
              {statusLabel}
            </h3>
            {filesSyncedCount > 0 && lastSyncResult === "success" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {filesSyncedCount} file{filesSyncedCount !== 1 ? "s" : ""} synced
              </span>
            )}
          </div>
          {lastSyncedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <Clock className="h-3 w-3" />
              <span>Last sync: {lastSyncedAt.toLocaleString()}</span>
            </div>
          )}
          {lastError && lastSyncResult === "failure" && (
            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
              {lastError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}