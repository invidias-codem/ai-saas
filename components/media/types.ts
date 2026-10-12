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
  /** Authenticated application endpoint with Content-Disposition: attachment. */
  downloadUrl?: string;
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
 * Validate that prediction.output is a usable URL we can hand to <video>/<audio>.
 * Replicate's terminal success only promises truthy `output`; the value can be
 * missing, empty, or a non-URL string. Anything else becomes a 'blank card'
 * in the UI. Only our owner-checked video preview route may use a relative URL;
 * provider URLs for the other media surfaces must remain absolute.
 */
export function isUsableMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  if (/^\/api\/video\/artifacts\/[0-9a-f-]{36}\/preview$/.test(value)) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * UI-facing generation status. `idle → generating → completed|failed`.
 * Video's `status` state already uses this shape; the poll hook (M4) will emit it.
 */
export type GenerationStatus = "idle" | "generating" | "completed" | "failed";
