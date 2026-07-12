import {
  emitInteractionAudit,
  type EmitInteractionAuditInput,
} from "@/lib/telemetry/emit";
import { setSink, LocalLedgerSink, NoopSink } from "@/lib/telemetry/sink";
import { MemoryLedger } from "@/lib/telemetry/ledger";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";

const BASE: EmitInteractionAuditInput = {
  requestedModelId: "hermes3",
  actualModelId: "gemini-3.1-pro-preview",
  systemProvider: "google",
  agentName: "fast",
  agentRole: "chat",
  creditCost: 1,
  macroWorkflowId: "wf-1",
};

describe("emitInteractionAudit", () => {
  afterEach(() => setSink(null));

  it("builds a valid UDIF record and writes it to the sink", async () => {
    const mem = new MemoryLedger();
    setSink(new LocalLedgerSink(mem));
    const rec = emitInteractionAudit(BASE);

    expect(rec).not.toBeNull();
    const stored = await mem.get();
    expect(stored).toHaveLength(1);

    const r = stored[0] as UdifInteractionAudit;
    expect(r.udif_version).toBe("2.0");
    expect(r.record_type).toBe("ai_interaction_audit");
    // Requested vs actual model routing captured (PRD §3).
    expect(r.ai_ledger["gen_ai.request.model"]).toBe("hermes3");
    expect(r.ai_ledger["gen_ai.response.model"]).toBe("gemini-3.1-pro-preview");
    expect(r.ai_ledger.system_provider).toBe("google");
    // Credit cost joined from subscription ledger.
    expect(r.context_baggage?.credit_cost).toBe("1");
    expect(r.context_baggage?.macro_workflow_id).toBe("wf-1");
    // content_mode defaults to metadata (hybrid audit decision).
    expect(r.context_baggage?.content_mode).toBe("metadata");
    // Agent identity from mode + role.
    expect(r.ai_ledger.agent_identity).toEqual({ name: "fast", role: "chat" });
  });

  it("honors an explicit content_mode flag", () => {
    setSink(new NoopSink());
    const rec = emitInteractionAudit({ ...BASE, contentMode: "hashed" });
    expect(rec?.context_baggage?.content_mode).toBe("hashed");
  });

  it("includes usage and actions when provided", () => {
    setSink(new NoopSink());
    const rec = emitInteractionAudit({
      ...BASE,
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      actions: [{ span_type: "execute_tool", "tool.name": "search", duration_ms: 5, status: "success" }],
    });
    expect(rec?.ai_ledger.usage).toEqual({ prompt_tokens: 10, completion_tokens: 20 });
    expect(rec?.ai_ledger.actions?.[0]["tool.name"]).toBe("search");
  });

  it("never throws on sink failure", async () => {
    const throwing = {
      emit: () => {
        throw new Error("boom");
      },
    };
    setSink(throwing as never);
    // Should return null, not throw.
    expect(() => emitInteractionAudit(BASE)).not.toThrow();
    expect(emitInteractionAudit(BASE)).toBeNull();
  });

  it("reuses a supplied trace_context", () => {
    setSink(new NoopSink());
    const trace_context = {
      trace_id: "fixed-trace",
      span_id: "fixed-span",
      parent_span_id: null,
    };
    const rec = emitInteractionAudit({ ...BASE, traceContext: trace_context });
    expect(rec?.trace_context.trace_id).toBe("fixed-trace");
  });
});
