import {
  signRecord,
  verifyRecordSignature,
  sha256Hex,
  canonicalize,
  signRecordEd25519,
  verifyRecordEd25519,
  publicKeyFromPrivateHex,
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

describe("Ed25519 asymmetric signing (server-held key)", () => {
  const priv = "9d61b19deffc5a5e5db1ebf7b7d2e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4";
  let pub: string;
  beforeAll(async () => {
    pub = await publicKeyFromPrivateHex(priv);
  });

  it("generates a valid Ed25519 keypair", () => {
    expect(pub).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs and verifies a record link with Ed25519", async () => {
    const rec = makeRecord();
    const chain = await signRecordEd25519(rec, "root", priv);
    expect(chain.sig_mode).toBe("ed25519");
    expect(chain.signing_public_key).toBe(pub);
    expect(await verifyRecordEd25519(rec, chain, "root", priv)).toBe(true);
  });

  it("detects tampering under Ed25519", async () => {
    const rec = makeRecord();
    const chain = await signRecordEd25519(rec, "root", priv);
    const mutated = makeRecord();
    mutated.ai_ledger["gen_ai.response.model"] = "attacker-model";
    expect(await verifyRecordEd25519(mutated, chain, "root", priv)).toBe(false);
  });

  it("rejects Ed25519 verification with the wrong public key", async () => {
    const rec = makeRecord();
    const chain = await signRecordEd25519(rec, "root", priv);
    const otherPriv =
      "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
    expect(await verifyRecordEd25519(rec, chain, "root", otherPriv)).toBe(false);
  });

  it("rejects Ed25519 when prev hash is wrong", async () => {
    const rec = makeRecord();
    const chain = await signRecordEd25519(rec, "root", priv);
    expect(await verifyRecordEd25519(rec, chain, "wrong-prev", priv)).toBe(false);
  });

  it("chains Ed25519 links so each is verifiable against the publisher key", async () => {
    const r1 = makeRecord({ trace_context: { trace_id: "a", span_id: "1", parent_span_id: null } });
    const r2 = makeRecord({ trace_context: { trace_id: "b", span_id: "2", parent_span_id: null } });
    const c1 = await signRecordEd25519(r1, "root", priv);
    const c2 = await signRecordEd25519(r2, c1.governance_signature, priv);
    expect(await verifyRecordEd25519(r1, c1, "root", priv)).toBe(true);
    expect(await verifyRecordEd25519(r2, c2, c1.governance_signature, priv)).toBe(true);
  });
});
