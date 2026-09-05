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

/* ─────────────────────── Approval envelope ─────────────────────── */

export interface ApprovalEnvelope {
  approvalId: string;
  toolName: string;
  params: any;
}

export const APPROVAL_EVENT_PREFIX = "__APPROVAL_EVENT__";

export function encodeApprovalEvent(envelope: ApprovalEnvelope): string {
  return `${APPROVAL_EVENT_PREFIX}${JSON.stringify(envelope)}`;
}

export function decodeApprovalEvent(line: string): ApprovalEnvelope | null {
  if (!line.startsWith(APPROVAL_EVENT_PREFIX)) return null;
  try {
    return JSON.parse(line.slice(APPROVAL_EVENT_PREFIX.length)) as ApprovalEnvelope;
  } catch {
    return null;
  }
}

/* ─────────────────────── Model-switch system event ─────────────────────── */

export interface ModelSwitchEvent {
  /** Model id we fell back FROM. */
  from: string;
  /** Model id now serving the stream. */
  to: string;
  /** Provider id of the serving model. */
  provider?: string;
  /** Short reason: rate limit / circuit open / degraded / provider down. */
  reason?: string;
  /** Epoch ms when the switch was emitted. */
  ts?: number;
}

export const MODEL_SWITCH_EVENT_PREFIX = '__MODEL_SWITCH_EVENT__:';

export function encodeModelSwitchEvent(ev: ModelSwitchEvent): string {
  return `${MODEL_SWITCH_EVENT_PREFIX}${JSON.stringify({ ...ev, ts: ev.ts ?? Date.now() })}\n`;
}

/** Decode a model-switch sentinel line (caller already stripped the leading whitespace). */
export function decodeModelSwitchEvent(line: string): ModelSwitchEvent | null {
  const idx = line.indexOf(MODEL_SWITCH_EVENT_PREFIX);
  if (idx === -1) return null;
  try {
    return JSON.parse(line.slice(idx + MODEL_SWITCH_EVENT_PREFIX.length)) as ModelSwitchEvent;
  } catch {
    return null;
  }
}