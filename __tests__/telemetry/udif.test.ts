import {
  UDIF_VERSION,
  isUdifInteractionAudit,
  type UdifInteractionAudit,
} from "@/lib/telemetry/udif";

/** Canonical PRD §3.1 example (abridged values preserved structurally). */
const PRD_FIXTURE: UdifInteractionAudit = {
  udif_version: "2.0",
  record_type: "ai_interaction_audit",
  timestamp: "2026-07-12T14:45:00Z",
  trace_context: {
    trace_id: "5b8aa5a2-c9a8-43d9-9f12-ef4456910a31",
    span_id: "7f9c21b3-a81e-42c2",
    parent_span_id: "1a2b3c4d-b92e-41f1",
  },
  context_baggage: { macro_workflow_id: "lattice-os-session-991" },
  ai_ledger: {
    system_provider: "anthropic",
    "gen_ai.request.model": "claude-fable-5",
    "gen_ai.response.model": "claude-fable-5-base",
    agent_identity: { name: "syntax_reviewer_agent", role: "code_analysis" },
    performance: { "gen_ai.client.operation.duration": 1450 },
    usage: { prompt_tokens: 4250, completion_tokens: 840 },
    actions: [
      {
        span_type: "execute_tool",
        "tool.name": "postgis_spatial_query",
        duration_ms: 320,
        status: "success",
      },
    ],
    governance: {
      context_role: "public_baseline",
      active_modules: ["general_reasoning", "syntax_analysis"],
      disabled_modules: ["offensive_cybersecurity"],
      defense_triggers: [],
    },
  },
};

describe("udif schema", () => {
  it("exposes UDIF_VERSION 2.0", () => {
    expect(UDIF_VERSION).toBe("2.0");
  });

  it("accepts the canonical PRD §3.1 fixture", () => {
    expect(isUdifInteractionAudit(PRD_FIXTURE)).toBe(true);
  });

  it("is assignable from the PRD example shape (compile-time contract)", () => {
    // If this compiles, the fixture satisfies the interface exactly.
    const rec: UdifInteractionAudit = PRD_FIXTURE;
    expect(rec.ai_ledger["gen_ai.response.model"]).toBe("claude-fable-5-base");
  });

  it("rejects null / non-object", () => {
    expect(isUdifInteractionAudit(null)).toBe(false);
    expect(isUdifInteractionAudit(42)).toBe(false);
    expect(isUdifInteractionAudit("nope")).toBe(false);
  });

  it("rejects records with wrong version or record_type", () => {
    expect(isUdifInteractionAudit({ ...PRD_FIXTURE, udif_version: "1.0" })).toBe(false);
    expect(
      isUdifInteractionAudit({ ...PRD_FIXTURE, record_type: "other" as never })
    ).toBe(false);
  });

  it("rejects records missing required ai_ledger model fields", () => {
    const bad = structuredClone(PRD_FIXTURE);
    delete (bad.ai_ledger as Record<string, unknown>)["gen_ai.response.model"];
    expect(isUdifInteractionAudit(bad)).toBe(false);
  });
});
