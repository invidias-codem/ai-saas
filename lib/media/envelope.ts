// lib/media/envelope.ts
// Explicit "_media" transport envelope: how a media-tool result crosses the
// agent-engine → chat-client boundary as a strongly-typed structured payload,
// decoupled from the ReAct trajectory internals.

export type MediaType = "music" | "video" | "image";

export interface MediaEnvelope {
  type: MediaType;
  /** Async predictions (music/video) only. */
  predictionId?: string;
  pollUrl?: string;
  /** Sync image results only. */
  urls?: string[];
  status: "pending" | "succeeded";
}

/**
 * Marker used by the engine to serialize media events on the stream. The client
 * parser recognizes lines beginning with this prefix, strips them from prose,
 * and attaches the parsed envelope to `message.media`.
 */
export const MEDIA_EVENT_PREFIX = "__MEDIA_EVENT__";

export function encodeMediaEvent(envelope: MediaEnvelope): string {
  return `${MEDIA_EVENT_PREFIX}${JSON.stringify(envelope)}`;
}

export function decodeMediaEvent(line: string): MediaEnvelope | null {
  if (!line.startsWith(MEDIA_EVENT_PREFIX)) return null;
  try {
    return JSON.parse(line.slice(MEDIA_EVENT_PREFIX.length)) as MediaEnvelope;
  } catch {
    return null;
  }
}

/** True when a tool result data payload carries a media envelope. */
export function hasMediaEnvelope(data: any): data is { _media?: MediaEnvelope } {
  return Boolean(data && typeof data === "object" && data._media);
}