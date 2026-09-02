import { MemoryLedger, openLedger, LEDGER_STORE } from "@/lib/telemetry/ledger";
import { newTrace } from "@/lib/telemetry/trace";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";

function makeRecord(overrides: Partial<UdifInteractionAudit> = {}): UdifInteractionAudit {
  const trace = newTrace();
  return {
    udif_version: "2.0",
    record_type: "ai_interaction_audit",
    timestamp: new Date().toISOString(),
    trace_context: trace,
    ai_ledger: {
      system_provider: "anthropic",
      "gen_ai.request.model": "claude-3-5-sonnet-20241022",
      "gen_ai.response.model": "claude-3-5-sonnet-20241022",
    },
    ...overrides,
  };
}

describe("MemoryLedger", () => {
  it("appends and reads back a record", async () => {
    const l = new MemoryLedger();
    const rec = makeRecord();
    await l.append(rec);
    const all = await l.get();
    expect(all).toHaveLength(1);
    expect(all[0].trace_context.trace_id).toBe(rec.trace_context.trace_id);
  });

  it("filters by trace_id", async () => {
    const l = new MemoryLedger();
    const a = makeRecord();
    const b = makeRecord();
    await l.append(a);
    await l.append(b);
    const filtered = await l.get({ trace_id: a.trace_context.trace_id });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trace_context.trace_id).toBe(a.trace_context.trace_id);
  });

  it("filters by since timestamp", async () => {
    const l = new MemoryLedger();
    const before = makeRecord({ timestamp: "2026-01-01T00:00:00Z" });
    const after = makeRecord({ timestamp: "2026-06-01T00:00:00Z" });
    await l.append(before);
    await l.append(after);
    const out = await l.get({ since: "2026-03-01T00:00:00Z" });
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe("2026-06-01T00:00:00Z");
  });

  it("clear empties the ledger", async () => {
    const l = new MemoryLedger();
    await l.append(makeRecord());
    await l.clear();
    expect(await l.get()).toHaveLength(0);
  });
});

describe("openLedger environment selection", () => {
  const realIndexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;

  afterEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = realIndexedDB;
  });

  it("returns MemoryLedger fallback when indexedDB is unavailable (SSR)", () => {
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    const store = openLedger();
    expect(store).toBeInstanceOf(MemoryLedger);
  });

  it("store constant is exported for schema reference", () => {
    expect(LEDGER_STORE).toBe("udif_ledger");
  });
});
