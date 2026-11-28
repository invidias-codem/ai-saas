"use client";

import { Terminal } from "lucide-react";

interface HardBlockTerminalProps {
  nonce: string;
  reason: string;
  onDismiss: () => void;
}

export function HardBlockTerminal({
  nonce,
  reason,
  onDismiss,
}: HardBlockTerminalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="mx-auto max-w-lg w-full px-4">
        <div className="border border-red-900/50 bg-neutral-950 p-6 sm:p-8">
          {/* Terminal header */}
          <div className="flex items-center gap-2 mb-6">
            <Terminal className="h-5 w-5 text-red-500" />
            <span className="text-sm font-mono text-red-400 uppercase tracking-wider">
              Session Halted
            </span>
          </div>

          {/* Reason */}
          <div className="mb-6">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">
              Termination reason
            </p>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {reason}
            </p>
          </div>

          {/* Audit nonce */}
          <div className="mb-6 rounded-md border border-neutral-800 bg-neutral-900/50 p-3">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
              Audit nonce
            </p>
            <p className="font-mono text-xs text-neutral-400 break-all">
              {nonce}
            </p>
          </div>

          {/* Compliance notice */}
          <div className="mb-6 text-xs text-neutral-500 leading-relaxed">
            This session has been terminated by the Boundary Critic.
            The persona state has transitioned to{" "}
            <span className="font-mono text-red-400">HALTED</span>.
            All violations have been recorded in the immutable audit trail.
            Contact your operator to resume.
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-6 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
              style={{ minHeight: 48 }}
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
