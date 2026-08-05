/**
 * W3C Trace Context generation for the Sovereign AI Telemetry ledger.
 *
 * Produces trace_id / span_id / parent_span_id per PRD §3. Spans form a
 * hierarchical parent-child graph across concurrent agent nodes: call
 * newSpan(parent) to branch a child span from an existing trace context.
 *
 * Uses the Web Crypto API (crypto.randomUUID) which is available in both
 * Node >=19 (global crypto) and browsers. Falls back to a non-crypto
 * uuid only when crypto is unavailable (should not happen in supported runtimes).
 */

import type { TraceContext } from "./udif";

export type { TraceContext } from "./udif";

function uuid(): string {
  // crypto.randomUUID is global in Node >=19 and all modern browsers.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // RFC4122 v4 fallback (non-crypto) — last-resort only.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** A 16-char hex span id (W3C trace flags use 8 bytes / 16 hex digits). */
function spanId(): string {
  return uuid().replace(/-/g, "").slice(0, 16);
}

/** Start a new root trace (no parent). */
export function newTrace(): TraceContext {
  return {
    trace_id: uuid(),
    span_id: spanId(),
    parent_span_id: null,
  };
}

/**
 * Branch a child span from an existing trace context.
 * Shares the parent's trace_id; the parent's span_id becomes this span's
 * parent_span_id. Generates a fresh span_id for the child.
 */
export function newSpan(parent: TraceContext): TraceContext {
  return {
    trace_id: parent.trace_id,
    span_id: spanId(),
    parent_span_id: parent.span_id,
  };
}

/** Generate a fresh trace context (alias of newTrace for readability at entry points). */
export function generateTraceContext(parentSpanId?: string): TraceContext {
  if (parentSpanId) {
    // Caller only knows the parent span id, not the full parent context.
    return {
      trace_id: uuid(),
      span_id: spanId(),
      parent_span_id: parentSpanId,
    };
  }
  return newTrace();
}
