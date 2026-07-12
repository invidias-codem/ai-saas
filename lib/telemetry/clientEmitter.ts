/**
 * Client-side telemetry emitter — Phase 2.2 (browser sovereign ledger).
 *
 * This module runs in the BROWSER. It writes UDIF 2.0 audit records to the
 * local IndexedDB ledger (the sovereign store) and reads them back for the
 * observability dashboard. On the server (no indexedDB) it degrades to the
 * in-memory ledger so importing it never throws during SSR.
 *
 * The Service Worker (public/sw-telemetry.js) calls emitToClientLedger() to
 * persist records it constructs from intercepted /api/chat|/api/code traffic.
 */

"use client";

import { openLedger, type LedgerFilter, type LedgerStore } from "./ledger";
import type { UdifInteractionAudit } from "./udif";

let clientLedger: LedgerStore | null = null;

function ledger(): LedgerStore {
  if (!clientLedger) clientLedger = openLedger();
  return clientLedger;
}

/** Persist a UDIF record to the sovereign client IndexedDB ledger. */
export async function emitToClientLedger(record: UdifInteractionAudit): Promise<void> {
  try {
    await ledger().append(record);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] client ledger append failed (non-blocking):", err);
    }
  }
}

/** Read records from the sovereign client ledger. */
export async function readClientLedger(filter?: LedgerFilter): Promise<UdifInteractionAudit[]> {
  try {
    return await ledger().get(filter);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] client ledger read failed:", err);
    }
    return [];
  }
}

/** Count of records currently in the ledger. */
export async function countClientLedger(): Promise<number> {
  return (await readClientLedger()).length;
}

/** Clear the local sovereign ledger (e.g. on user export/reset). */
export async function clearClientLedger(): Promise<void> {
  try {
    await ledger().clear();
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] client ledger clear failed:", err);
    }
  }
}
