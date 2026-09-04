/**
 * Shared Replicate prediction types for the media generation surfaces.
 * Consolidates the three copy-pasted `ReplicatePrediction` interfaces from
 * image/content.tsx, video/content.tsx, and music/content.tsx.
 */

export type ReplicateStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export interface ReplicatePrediction {
  id: string;
  status: ReplicateStatus;
  /** nano-banana (image) can emit a string or an array; video/music emit a string. */
  output?: string | string[];
  error?: {
    detail?: string;
  };
}

/** Extract a single output URL (video/music); ignores array outputs (image). */
export function singleOutput(prediction: ReplicatePrediction): string | null {
  if (typeof prediction.output === "string") return prediction.output;
  return null;
}

/**
 * UI-facing generation status. `idle → generating → completed|failed`.
 * Video's `status` state already uses this shape; the poll hook (M4) will emit it.
 */
export type GenerationStatus = "idle" | "generating" | "completed" | "failed";