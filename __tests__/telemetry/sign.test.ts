import {
  signRecord,
  verifyRecordSignature,
  sha256Hex,
  canonicalize,
} from "@/lib/telemetry/sign";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";

function makeRecord(over: Partial<UdifInteractionAudit> = {}): UdifInteractionAudit {
  return {
    udif_version: "2.0",
    record_type: "ai_interaction_audit",
    timestamp: new Date().toISOString(),
    trace_context: { trace_id: "t1", span_id: "s1", parent_span_id: null },
    context_baggage: { content_mode: "metadata" },
    ai_ledger: {
      system_provider: "google",
      "gen_ai.request.model": "hermes3",
      "gen_ai.response.model": "gemini-3.1-pro-preview",
      agent_identity: { name: "fast", role: "chat" },
    },
    ...over,
  } as UdifInteractionAudit;
}

describe("hash-chain signing", () => {
  it("produces a deterministic sha256 hash", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("canonicalize sorts keys deterministically", () => {
    const c1 = canonicalize({ b: 1, a: 2 });
    const c2 = canonicalize({ a: 2, b: 1 });
    expect(c1).toBe(c2);
  });

  it("signs a record and the signature verifies against the prev hash", async () => {
    const rec = makeRecord();
    const chain = await signRecord(rec, "root");
    expect(chain.prev_record_hash).toBe("root");
    expect(chain.governance_signature).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyRecordSignature(rec, chain, "root")).toBe(true);
  });

  it("detects tampering with the record payload", async () => {
    const rec = makeRecord();
    const chain = await signRecord(rec, "root");
    // Mutate the persisted record after signing.
    const mutated = makeRecord();
    mutated.ai_ledger["gen_ai.response.model"] = "attacker-model";
    expect(await verifyRecordSignature(mutated, chain, "root")).toBe(false);
  });

  it("detects a broken chain link (wrong prev hash)", async () => {
    const rec = makeRecord();
    const chain = await signRecord(rec, "root");
    expect(await verifyRecordSignature(rec, chain, "wrong-prev")).toBe(false);
  });

  it("chains multiple records so each links to the previous", async () => {
    const r1 = makeRecord({ trace_context: { trace_id: "a", span_id: "1", parent_span_id: null } });
    const r2 = makeRecord({ trace_context: { trace_id: "b", span_id: "2", parent_span_id: null } });
    const c1 = await signRecord(r1, "root");
    const c2 = await signRecord(r2, c1.governance_signature);
    expect(c2.prev_record_hash).toBe(c1.governance_signature);
    expect(await verifyRecordSignature(r1, c1, "root")).toBe(true);
    expect(await verifyRecordSignature(r2, c2, c1.governance_signature)).toBe(true);
    // r2 must NOT verify against root (chain integrity).
    expect(await verifyRecordSignature(r2, c2, "root")).toBe(false);
  });
});
