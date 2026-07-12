import {
  getSink,
  setSink,
  LocalLedgerSink,
  NoopSink,
  buildAuditRecord,
} from "@/lib/telemetry/sink";
import { MemoryLedger } from "@/lib/telemetry/ledger";
import { newTrace } from "@/lib/telemetry/trace";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";

describe("TelemetrySink", () => {
  afterEach(() => setSink(null));

  it("getSink returns a LocalLedgerSink by default that persists to ledger", async () => {
    const mem = new MemoryLedger();
    setSink(new LocalLedgerSink(mem));
    const rec = buildAuditRecord({
      trace_context: newTrace(),
      ai_ledger: {
        system_provider: "anthropic",
        "gen_ai.request.model": "m",
        "gen_ai.response.model": "m",
      },
    });
    await getSink().emit(rec);
    const stored = await mem.get();
    expect(stored).toHaveLength(1);
    expect(stored[0].ai_ledger.system_provider).toBe("anthropic");
  });

  it("NoopSink drops records", async () => {
    const mem = new MemoryLedger();
    setSink(new NoopSink());
    await getSink().emit(
      buildAuditRecord({
        trace_context: newTrace(),
        ai_ledger: { system_provider: "x", "gen_ai.request.model": "a", "gen_ai.response.model": "b" },
      })
    );
    expect(await mem.get()).toHaveLength(0);
  });

  it("buildAuditRecord fills version/record_type/timestamp defaults", () => {
    const rec: UdifInteractionAudit = buildAuditRecord({
      trace_context: newTrace(),
      ai_ledger: { system_provider: "local", "gen_ai.request.model": "r", "gen_ai.response.model": "a" },
    });
    expect(rec.udif_version).toBe("2.0");
    expect(rec.record_type).toBe("ai_interaction_audit");
    expect(typeof rec.timestamp).toBe("string");
  });
});
