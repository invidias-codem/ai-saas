import {
  emitToClientLedger,
  readClientLedger,
  clearClientLedger,
} from "@/lib/telemetry/clientEmitter";

// In the jest/jsdom environment there is no indexedDB, so openLedger() falls
// back to the in-memory ledger. We assert the API is safe and non-throwing.
describe("clientEmitter (browser ledger)", () => {
  it("does not throw when emitting without indexedDB", async () => {
    const record = {
      udif_version: "2.0",
      record_type: "ai_interaction_audit",
      timestamp: new Date().toISOString(),
      trace_context: { trace_id: "t1", span_id: "s1", parent_span_id: null },
      context_baggage: { content_mode: "metadata" },
      ai_ledger: { system_provider: "google", agent_identity: { name: "fast", role: "chat" } },
    } as any;
    await expect(emitToClientLedger(record)).resolves.toBeUndefined();
  });

  it("readClientLedger returns an array (graceful, never throws)", async () => {
    const recs = await readClientLedger();
    expect(Array.isArray(recs)).toBe(true);
  });

  it("clearClientLedger does not throw", async () => {
    await expect(clearClientLedger()).resolves.toBeUndefined();
  });
});
