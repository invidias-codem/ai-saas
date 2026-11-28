"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { ApprovalEnvelope, MediaEnvelope } from "@/lib/media/envelope";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MediaApprovalCardProps {
  approvalRequest: ApprovalEnvelope;
  /** Fired with the resolved media (approve) or [] (deny) so the parent can update the message. */
  onResolved: (media: MediaEnvelope[]) => void;
}

const ACCENTS: Record<string, string> = {
  generate_music: "text-emerald-500 border-emerald-500/30",
  generate_image: "text-violet-500 border-violet-500/30",
  generate_video: "text-pink-600 border-pink-600/30",
};

const TOOL_LABEL: Record<string, string> = {
  generate_music: "Generate Music",
  generate_image: "Generate Image",
  generate_video: "Generate Video",
};

/**
 * Human-in-the-loop confirmation card for a mutative media tool. Confirm POSTs
 * /api/approval/resume {approved:true} (executes the paused tool and returns a
 * `_media` envelope for inline rendering); Deny drops the request with zero
 * credit deduction.
 */
export function MediaApprovalCard({ approvalRequest, onResolved }: MediaApprovalCardProps) {
  const [state, setState] = useState<"pending" | "resolving" | "approved" | "denied">("pending");
  const accent = ACCENTS[approvalRequest.toolName] ?? "text-muted-foreground border-border";
  const label = TOOL_LABEL[approvalRequest.toolName] ?? approvalRequest.toolName;
  const prompt = typeof approvalRequest.params?.prompt === "string" ? approvalRequest.params.prompt : null;

  const resolve = async (approved: boolean) => {
    setState("resolving");
    try {
      const res = await fetch("/api/approval/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approvalRequest.approvalId, approved }),
      });
      const data = await res.json().catch(() => ({}));

      if (approved) {
        const media = data.media ? [data.media as MediaEnvelope] : [];
        setState("approved");
        onResolved(media);
      } else {
        setState("denied");
        onResolved([]);
      }
    } catch {
      setState("pending");
    }
  };

  if (state === "approved") {
    return null; // The parent swaps in the InlineMediaCard via the resolved media.
  }

  return (
    <div className={cn("mt-3 rounded-xl border bg-card/60 px-4 py-3", accent)}>
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold">{label}</p>
          {prompt && <p className="text-xs text-muted-foreground break-words">“{prompt}”</p>}
          {state === "denied" && (
            <p className="text-xs text-muted-foreground italic">Action canceled — no action taken.</p>
          )}
        </div>
      </div>

      {state !== "denied" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => resolve(true)}
            disabled={state === "resolving"}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {state === "resolving" ? "Working…" : "Confirm"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => resolve(false)} disabled={state === "resolving"}>
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}