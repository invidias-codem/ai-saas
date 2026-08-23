"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DispatchEnvelope } from "@/hooks/useDispatch";

interface BorderlineBannerProps {
  response: DispatchEnvelope;
  onElevatedRetry: (nonce: string) => void;
  onDismiss: () => void;
  isRetrying?: boolean;
}

export function BorderlineBanner({
  response,
  onElevatedRetry,
  onDismiss,
  isRetrying = false,
}: BorderlineBannerProps) {
  const nonce = response.auditNonce;
  const reason =
    response.causalViolations[0]?.driftDescription ??
    response.degradedReason ??
    "Persona boundary restriction";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-500/30 bg-amber-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-200">
              Context contains untrusted or out-of-bounds content
            </p>
            <p className="mt-1 text-xs text-amber-300/80 line-clamp-2">
              {reason}
            </p>
            <p className="mt-1 text-xs text-amber-500/60 font-mono">
              Audit nonce: {nonce.slice(0, 8)}...{nonce.slice(-4)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onElevatedRetry(nonce)}
              disabled={isRetrying}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
                "text-xs font-medium transition-colors",
                "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30",
                "border border-amber-500/30",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              {isRetrying ? "Evaluating..." : "Request elevated tier"}
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="rounded-md p-1.5 text-amber-400 hover:text-amber-200 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
