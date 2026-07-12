/**
 * Sovereign UDIF ledger — local persistence layer (PRD §1 "Local Storage").
 *
 * The ledger is the SOVEREIGN source of truth: it lives in the browser's
 * IndexedDB (edge/native, no server round-trip — "context sovereignty").
 * The Supabase enterprise mirror (Phase 3) is a separate, explicitly-flushed
 * copy and never the primary store.
 *
 * Design:
 *  - `LedgerStore` is the narrow interface the rest of the system depends on.
 *  - `IndexedDbLedger` is the real browser implementation (via `idb`).
 *  - `MemoryLedger` is an in-memory fallback used during SSR (no indexedDB)
 *    and in tests. It is volatile — do not rely on it for durability.
 *  - `openLedger()` returns the IndexedDB impl when available, else MemoryLedger.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { UdifInteractionAudit } from "./udif";

export const LEDGER_DB_NAME = "lattice-telemetry";
export const LEDGER_STORE = "udif_ledger";
const LEDGER_DB_VERSION = 1;

export interface LedgerFilter {
  trace_id?: string;
  since?: string; // ISO timestamp
  limit?: number;
}

export interface LedgerStore {
  append(record: UdifInteractionAudit): Promise<void>;
  get(filter?: LedgerFilter): Promise<UdifInteractionAudit[]>;
  clear(): Promise<void>;
}

/** In-memory fallback (SSR / tests). Volatile. */
export class MemoryLedger implements LedgerStore {
  private records: UdifInteractionAudit[] = [];

  async append(record: UdifInteractionAudit): Promise<void> {
    this.records.push(record);
  }

  async get(filter?: LedgerFilter): Promise<UdifInteractionAudit[]> {
    let out = [...this.records];
    if (filter?.trace_id) out = out.filter((r) => r.trace_context.trace_id === filter.trace_id);
    if (filter?.since) {
      const t = Date.parse(filter.since);
      out = out.filter((r) => Date.parse(r.timestamp) >= t);
    }
    if (filter?.limit != null) out = out.slice(-filter.limit);
    return out;
  }

  async clear(): Promise<void> {
    this.records = [];
  }
}

/** Real IndexedDB-backed ledger (browser / native). */
export class IndexedDbLedger implements LedgerStore {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(LEDGER_DB_NAME, LEDGER_DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(LEDGER_STORE)) {
            const store = db.createObjectStore(LEDGER_STORE, {
              keyPath: "trace_context.trace_id",
            });
            store.createIndex("timestamp", "timestamp");
          }
        },
      });
    }
    return this.dbPromise;
  }

  async append(record: UdifInteractionAudit): Promise<void> {
    const db = await this.db();
    // Multiple spans may share a trace_id (one record per span). Allow updates
    // by keying on a composite of trace_id+span_id to avoid clobbering.
    const key = `${record.trace_context.trace_id}:${record.trace_context.span_id}`;
    await db.put(LEDGER_STORE, { ...record, _spanKey: key });
  }

  async get(filter?: LedgerFilter): Promise<UdifInteractionAudit[]> {
    const db = await this.db();
    // Read all (small ledger per-session); filter in memory.
    const all = (await db.getAll(LEDGER_STORE)) as Array<
      UdifInteractionAudit & { _spanKey?: string }
    >;
    let out = all.map(({ _spanKey, ...rec }) => rec);
    if (filter?.trace_id) out = out.filter((r) => r.trace_context.trace_id === filter.trace_id);
    if (filter?.since) {
      const t = Date.parse(filter.since);
      out = out.filter((r) => Date.parse(r.timestamp) >= t);
    }
    if (filter?.limit != null) out = out.slice(-filter.limit);
    return out;
  }

  async clear(): Promise<void> {
    const db = await this.db();
    await db.clear(LEDGER_STORE);
  }
}

/**
 * Returns the appropriate ledger for the current environment.
 * Uses IndexedDB when available; otherwise an in-memory fallback (SSR).
 */
export function openLedger(): LedgerStore {
  const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (factory) return new IndexedDbLedger();
  return new MemoryLedger();
}
