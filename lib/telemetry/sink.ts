/**
 * TelemetrySink — the single emission seam for the Sovereign AI Telemetry MVP.
 *
 * Phase 1 instrumentation calls `getSink().emit(record)`. Everything else
 * about *where* the record goes is encapsulated here, so the Runtime Bridge
 * never imports IndexedDB / Supabase directly.
 *
 * Default sink: `LocalLedgerSink` — writes to the local sovereign IndexedDB
 * ledger (via openLedger). A no-op sink is used during SSR / when no browser
 * storage is present, so server-side renders never throw.
 *
 * Phase 3 will add an `EnterpriseFlushSink` wrapper that additionally forwards
 * signed records to the dedicated telemetry Supabase instance.
 */

import { openLedger, type LedgerStore } from "./ledger";
import type { UdifInteractionAudit } from "./udif";

export interface TelemetrySink {
  emit(record: UdifInteractionAudit): void | Promise<void>;
}

/** Writes every record to the local sovereign ledger. */
export class LocalLedgerSink implements TelemetrySink {
  constructor(private readonly store: LedgerStore) {}

  emit(record: UdifInteractionAudit): Promise<void> {
    return this.store.append(record);
  }
}

/** Drops all records (SSR / tests / disabled telemetry). */
export class NoopSink implements TelemetrySink {
  emit(): void {
    /* intentionally does nothing */
  }
}

let sink: TelemetrySink | null = null;
let override: TelemetrySink | null = null;

/**
 * Returns the active sink. Lazily constructs a LocalLedgerSink backed by
 * openLedger() (which itself falls back to MemoryLedger on the server).
 */
export function getSink(): TelemetrySink {
  if (override) return override;
  if (!sink) {
    sink = new LocalLedgerSink(openLedger());
  }
  return sink;
}

/** Test/DI hook: explicitly set the active sink. Pass null to reset to default. */
export function setSink(next: TelemetrySink | null): void {
  override = next;
  if (next === null) sink = null;
}

/** Convenience builder for a full audit record from its parts. */
export function buildAuditRecord(
  partial: Omit<UdifInteractionAudit, "udif_version" | "record_type" | "timestamp"> & {
    timestamp?: string;
  }
): UdifInteractionAudit {
  const { timestamp, ...rest } = partial;
  return {
    udif_version: "2.0",
    record_type: "ai_interaction_audit",
    timestamp: timestamp ?? new Date().toISOString(),
    ...rest,
  };
}
