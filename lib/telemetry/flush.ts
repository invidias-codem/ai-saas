/**
 * Client-side batch flush — Phase 2.2 / Phase 3 bridge.
 *
 * Reads the sovereign local ledger and forwards records to the dedicated
 * telemetry Supabase instance via /api/telemetry/flush (created in Phase 3).
 * Honors the hybrid audit decision: records with content_mode "local_only"
 * are ALWAYS stripped before leaving the device (DECIDED 2026-07-12).
 */

"use client";

import { readClientLedger, clearClientLedger } from "./clientEmitter";
import type { UdifInteractionAudit } from "./udif";

export interface FlushResult {
  attempted: number;
  sent: number;
  failed: number;
}

/** Strip any payloads that must never leave the device. */
function sanitizeForExport(records: UdifInteractionAudit[]): UdifInteractionAudit[] {
  return records
    .filter((r) => r.context_baggage?.content_mode !== "local_only")
    .map((r) => {
      // Defensive: ensure no plaintext content slips through on hashed mode.
      if (r.context_baggage?.content_mode === "hashed") {
        // Hashed context only carries hashes; nothing to strip. Passthrough.
      }
      return r;
    });
}

/**
 * Flush the local ledger to the telemetry backend.
 * No-op safe: if the endpoint is unavailable, records remain local.
 */
export async function flushClientLedger(options?: {
  clearOnSuccess?: boolean;
}): Promise<FlushResult> {
  const result: FlushResult = { attempted: 0, sent: 0, failed: 0 };
  try {
    const all = await readClientLedger();
    const toSend = sanitizeForExport(all);
    result.attempted = toSend.length;
    if (toSend.length === 0) return result;

    const res = await fetch("/api/telemetry/flush", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: toSend }),
    });

    if (res.ok) {
      result.sent = toSend.length;
      if (options?.clearOnSuccess) await clearClientLedger();
    } else {
      result.failed = toSend.length;
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] flush failed (records kept local):", err);
    }
    result.failed = result.attempted;
  }
  return result;
}
