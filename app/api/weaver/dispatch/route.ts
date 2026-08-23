// app/api/weaver/dispatch/route.ts
// Main dispatch endpoint for the Weaver/Chameleon Consultant.
// Receives a task request, runs the four-stage UCOL pipeline,
// and returns a frontend-safe envelope.

import { NextResponse } from "next/server";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import { PersonaStateMachine, initializePersonaStateMachine } from "@/lib/consultant/persona-state/state-machine";
import { AUTHORIZED_TRIGGERS } from "@/lib/consultant/persona-state/persona-schema";
import { BoundaryCritic } from "@/lib/consultant/persona-state/boundary-critic";
import { UnifiedContextOrchestrator, TaskType, TierFloor } from "@/lib/consultant/persona-state/router";
import { ProviderHealthChecker } from "@/lib/consultant/persona-state/provider-health";
import { canonicalPersonaBytes } from "@/lib/consultant/persona-state/canonicalize";
import type { SupabaseKV } from "@/lib/state/kv";
import { timingSafeCompare } from "@/lib/auth";

const DispatchRequestSchema = z.object({
  taskType: TaskType,
  prompt: z.string().min(1).max(100_000),
  candidateOutput: z.string().min(1).max(1_000_000),
  contextTokens: z.number().int().nonnegative().max(1_000_000),
  sessionId: z.string().min(1),
  agentId: z.string().optional(),
  requestedTier: TierFloor.optional(),
});

export const runtime = "nodejs";

// ── Supabase KV Helpers ─────────────────────────────────────────────

function mapRowToPersonaDocument(row: {
  document_id: string;
  nonce: string;
  previous_version_hash: string;
  signature_hash: string;
  state: string;
  allowed_namespaces: string[];
  forbidden_namespaces: string[];
  tone_lock: string;
  transition_audit: {
    triggerEvent: string;
    timestamp: string;
  };
}): any {
  return {
    documentId: row.document_id,
    nonce: row.nonce,
    previousVersionHash: row.previous_version_hash,
    signatureHash: row.signature_hash,
    state: row.state as any,
    domainBoundaries: {
      allowedNamespaces: row.allowed_namespaces,
      forbiddenNamespaces: row.forbidden_namespaces,
      toneLock: row.tone_lock as any,
    },
    transitionAudit: row.transition_audit,
  };
}

async function loadPersonaMachine(): Promise<{
  machine: PersonaStateMachine;
  kv: SupabaseKV;
}> {
  const { createStateKV } = await import("@/lib/state/kv");
  const kv = createStateKV();

  const stored = await kv.getCurrentPersona();
  if (stored) {
    const { PersonaChainVerifier } = await import(
      "@/lib/consultant/persona-state/persona-schema"
    );
    const verifier = new PersonaChainVerifier(
      stored.previous_version_hash ?? stored.signature_hash,
    );
    const { PersonaStateMachine: PSM } = await import(
      "@/lib/consultant/persona-state/state-machine"
    );
    return {
      machine: PersonaStateMachine.create(
        mapRowToPersonaDocument(stored),
        mapRowToPersonaDocument(stored),
        verifier,
      ),
      kv,
    };
  }

  // Bootstrap from signed config
  const signedConfigRaw = process.env.LATTICE_SIGNED_CONFIG;
  if (!signedConfigRaw) {
    throw new Error(
      "No persona state found and LATTICE_SIGNED_CONFIG is not set",
    );
  }

  const signedConfig = JSON.parse(signedConfigRaw);
  const { initializePersonaStateMachine } = await import(
    "@/lib/consultant/persona-state/state-machine"
  );
  const initialized = await initializePersonaStateMachine(signedConfig);
  return {
    machine: PersonaStateMachine.create(
      initialized.genesis,
      initialized.current,
      initialized.chainVerifier,
    ),
    kv,
  };
}

async function persistTransition(
  kv: SupabaseKV,
  doc: any,
  transitionName: string,
): Promise<void> {
  try {
    await kv.setCurrentPersona({
      documentId: doc.documentId,
      nonce: doc.nonce,
      previousVersionHash: doc.previousVersionHash,
      signatureHash: doc.signatureHash,
      state: doc.state,
      allowedNamespaces: doc.domainBoundaries.allowedNamespaces,
      forbiddenNamespaces: doc.domainBoundaries.forbiddenNamespaces,
      toneLock: doc.domainBoundaries.toneLock,
      transitionAudit: doc.transitionAudit,
    });

    await kv.appendChainLink({
      documentId: doc.documentId,
      nonce: doc.nonce,
      versionHash: doc.signatureHash,
      previousVersionHash: doc.previousVersionHash,
      transitionName,
      timestamp: doc.transitionAudit.timestamp,
    });
  } catch (err) {
    console.error("[Weaver] Failed to persist persona transition:", err);
  }
}

async function appendAudit(
  kv: SupabaseKV,
  nonce: string,
  stage: string,
  result: string,
  params: {
    criticDecision?: string;
    violations?: unknown;
    provider?: string;
    model?: string;
    tier?: string;
    downgraded?: boolean;
    taskType: string;
    sessionId: string;
  },
): Promise<void> {
  try {
    await kv.appendAuditEntry({
      dispatchNonce: nonce,
      stage,
      result,
      criticDecision: params.criticDecision,
      violations: params.violations,
      provider: params.provider,
      model: params.model,
      tier: params.tier,
      downgraded: params.downgraded,
      taskType: params.taskType,
      sessionId: params.sessionId,
    });
  } catch (err) {
    console.error("[Weaver] Failed to append audit entry:", err);
  }
}

// ── Route ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // TEMP: bypass auth for local PH dry-run
  // const authHeader = request.headers.get("authorization");
  // const secret = process.env.AGENTMEMORY_SECRET;
  // const expected = `Bearer ${secret ?? ""}`;
  // const authOk = authHeader ? timingSafeCompare(authHeader, expected) : false;
  // if (!authOk) {
  //   console.error("[Weaver] Auth failed", { received: authHeader, expected });
  //   return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = DispatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const req = parsed.data;

  let personaMachine: PersonaStateMachine;
  let kv: SupabaseKV;
  try {
    const loaded = await loadPersonaMachine();
    personaMachine = loaded.machine;
    kv = loaded.kv;
  } catch (err) {
    return NextResponse.json(
      {
        error: "Persona initialization failed",
        details: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 },
    );
  }

  const activePersona = personaMachine.getCurrent();
  const critic = new BoundaryCritic(activePersona);

  const allProviders = [
    "anthropic-opus",
    "anthropic-sonnet",
    "anthropic-haiku",
    "openrouter-heavy",
    "openrouter-mid",
    "openrouter-auto",
    "gemini-ultra",
    "gemini-pro",
    "gemini-flash",
  ];
  const providerHealth = new ProviderHealthChecker(allProviders, undefined, kv);
  const router = new UnifiedContextOrchestrator(activePersona, providerHealth);

  // ── Stage 1: Persona Guard ─────────────────────────────────────────
  if (activePersona.state !== "CONSULTING") {
    await appendAudit(kv, uuidv7(), "PERSONA_GUARD", "BLOCKED", {
      taskType: req.taskType,
      sessionId: req.sessionId,
      criticDecision: "HARD_BLOCK",
      violations: [
        {
          namespaceRule: "persona.state",
          thresholdDelta: 0,
          driftDescription: `Persona state is ${activePersona.state}, expected CONSULTING`,
        },
      ],
    });

    return NextResponse.json(
      {
        decision: "HARD_BLOCK",
        personaState: activePersona.state,
        criticDecision: "HARD_BLOCK",
        causalViolations: [
          {
            namespaceRule: "persona.state",
            thresholdDelta: 0,
            driftDescription: `Persona state is ${activePersona.state}, expected CONSULTING`,
          },
        ],
        auditNonce: uuidv7(),
        timestamp: new Date().toISOString(),
        terminalReason: `Persona state ${activePersona.state} is not authorized for dispatch`,
      },
      { status: 403 },
    );
  }

  // ── Stage 2: Boundary Critic ───────────────────────────────────────
  const criticResult = critic.evaluate({
    candidateOutput: req.candidateOutput,
    activePersonaState: activePersona,
    routeTier: "STANDARD",
    interceptNonce: uuidv7(),
  });

  await appendAudit(kv, criticResult.auditTrail.interceptNonce, "BOUNDARY_CRITIC", criticResult.decision, {
    criticDecision: criticResult.decision,
    violations: criticResult.causalViolations,
    taskType: req.taskType,
    sessionId: req.sessionId,
  });

  if (criticResult.decision === "HARD_BLOCK") {
    try {
      const next = await personaMachine.transition(
        "HALTED",
        "BOUNDARY_VIOLATION",
        { dispatchNonce: criticResult.auditTrail.interceptNonce },
      );
      await persistTransition(kv, next, "CONSULTING_TO_HALTED");
    } catch {
      // HALTED transition failed — log but return the block
    }

    return NextResponse.json(
      {
        decision: "HARD_BLOCK",
        personaState: "HALTED",
        criticDecision: "HARD_BLOCK",
        causalViolations: criticResult.causalViolations,
        auditNonce: criticResult.auditTrail.interceptNonce,
        timestamp: new Date().toISOString(),
        terminalReason:
          criticResult.auditTrail.degradedReason ??
          "Boundary critic returned HARD_BLOCK",
      },
      { status: 403 },
    );
  }

  if (criticResult.decision === "BORDERLINE") {
    return NextResponse.json(
      {
        decision: "DEGRADED",
        personaState: activePersona.state,
        criticDecision: "BORDERLINE",
        causalViolations: criticResult.causalViolations,
        auditNonce: criticResult.auditTrail.interceptNonce,
        timestamp: new Date().toISOString(),
        degradedReason:
          criticResult.auditTrail.degradedReason ??
          "Context contains untrusted or untagged chunks",
      },
      { status: 200 },
    );
  }

  // ── Stage 3: Router ────────────────────────────────────────────────
  let routerResult: ReturnType<typeof router.route>;
  try {
    routerResult = router.route({
      taskType: req.taskType,
      prompt: req.prompt,
      contextTokens: req.contextTokens,
      requestedTier: req.requestedTier,
    });
  } catch (routerError) {
    await appendAudit(kv, criticResult.auditTrail.interceptNonce, "ROUTER", "FAILED", {
      criticDecision: "HARD_BLOCK",
      violations: [
        {
          namespaceRule: "router.fallback",
          thresholdDelta: 0,
          driftDescription: `Router failed: ${routerError instanceof Error ? routerError.message : "unknown"}`,
        },
      ],
      taskType: req.taskType,
      sessionId: req.sessionId,
    });

    return NextResponse.json(
      {
        decision: "HARD_BLOCK",
        personaState: activePersona.state,
        criticDecision: "HARD_BLOCK",
        causalViolations: [
          {
            namespaceRule: "router.fallback",
            thresholdDelta: 0,
            driftDescription: `Router failed: ${routerError instanceof Error ? routerError.message : "unknown"}`,
          },
        ],
        auditNonce: criticResult.auditTrail.interceptNonce,
        timestamp: new Date().toISOString(),
        terminalReason: "No provider available for required tier",
      },
      { status: 503 },
    );
  }

  await appendAudit(kv, criticResult.auditTrail.interceptNonce, "ROUTER", "RESOLVED", {
    provider: routerResult.provider,
    model: routerResult.model,
    tier: routerResult.tier,
    downgraded: routerResult.downgraded,
    taskType: req.taskType,
    sessionId: req.sessionId,
  });

  // Persist provider health changes
  await kv.setProviderHealth({
    provider_key: routerResult.provider,
    status: "HEALTHY",
    last_checked: new Date().toISOString(),
    failure_count: 0,
  });

  // ── Stage 4: Dispatch ──────────────────────────────────────────────
  await appendAudit(kv, criticResult.auditTrail.interceptNonce, "DISPATCH", "READY", {
    provider: routerResult.provider,
    model: routerResult.model,
    tier: routerResult.tier,
    taskType: req.taskType,
    sessionId: req.sessionId,
  });

  let responseText: string;
  try {
    responseText = await dispatchProviderCall(routerResult, req.prompt);
  } catch (err) {
    await appendAudit(kv, criticResult.auditTrail.interceptNonce, "DISPATCH", "FAILED", {
      provider: routerResult.provider,
      model: routerResult.model,
      tier: routerResult.tier,
      taskType: req.taskType,
      sessionId: req.sessionId,
    });

    return NextResponse.json(
      {
        decision: "HARD_BLOCK",
        personaState: activePersona.state,
        criticDecision: "PASS",
        causalViolations: [
          {
            namespaceRule: "dispatch.provider",
            thresholdDelta: 0,
            driftDescription: `Provider dispatch failed: ${err instanceof Error ? err.message : "unknown"}`,
          },
        ],
        auditNonce: criticResult.auditTrail.interceptNonce,
        timestamp: new Date().toISOString(),
        terminalReason: "Provider dispatch failed",
      },
      { status: 502 },
    );
  }

  await appendAudit(kv, criticResult.auditTrail.interceptNonce, "DISPATCH", "COMPLETED", {
    provider: routerResult.provider,
    model: routerResult.model,
    tier: routerResult.tier,
    taskType: req.taskType,
    sessionId: req.sessionId,
  });

  return NextResponse.json(
    {
      decision: "DISPATCHED",
      personaState: activePersona.state,
      criticDecision: "PASS",
      causalViolations: [],
      router: {
        tier: routerResult.tier,
        provider: routerResult.provider,
        model: routerResult.model,
      },
      auditNonce: criticResult.auditTrail.interceptNonce,
      timestamp: new Date().toISOString(),
      response: responseText,
    },
    { status: 200 },
  );
}

// ── Provider Dispatch ────────────────────────────────────────────────

type ProviderKey =
  | "anthropic-opus"
  | "anthropic-sonnet"
  | "anthropic-haiku"
  | "openrouter-heavy"
  | "openrouter-mid"
  | "openrouter-auto"
  | "gemini-ultra"
  | "gemini-pro"
  | "gemini-flash";

const PROVIDER_MODEL_MAP: Record<ProviderKey, { provider: "claude" | "openrouter" | "gemini"; model: string }> = {
  "anthropic-opus": { provider: "claude", model: "claude-opus-4-20250514" },
  "anthropic-sonnet": { provider: "claude", model: "claude-sonnet-4-20250514" },
  "anthropic-haiku": { provider: "claude", model: "claude-3-5-haiku-20241022" },
  "openrouter-heavy": { provider: "openrouter", model: "anthropic/opus" },
  "openrouter-mid": { provider: "openrouter", model: "anthropic/sonnet" },
  "openrouter-auto": { provider: "openrouter", model: "auto" },
  "gemini-ultra": { provider: "gemini", model: "gemini-2.5-ultra" },
  "gemini-pro": { provider: "gemini", model: "gemini-2.5-pro" },
  "gemini-flash": { provider: "gemini", model: "gemini-2.5-flash" },
};

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

async function dispatchProviderCall(
  routerResult: { provider: string; model: string },
  prompt: string,
): Promise<string> {
  const providerKey = routerResult.provider as ProviderKey;
  const mapping = PROVIDER_MODEL_MAP[providerKey] ?? { provider: "openrouter" as const, model: "auto" };

  if (mapping.provider === "openrouter") {
    const { OpenRouterProvider } = await import("@/lib/llm/providers/openrouter");
    const provider = new OpenRouterProvider();
    const result = await provider.generateStream(
      [{ role: "user", text: prompt }],
      undefined,
      { model: mapping.model, maxTokens: 2048 },
    );
    return collectStream(result.stream);
  }

  if (mapping.provider === "gemini") {
    const { GeminiProvider } = await import("@/lib/llm/providers/gemini");
    const provider = new GeminiProvider();
    const result = await provider.generateStream(
      [{ role: "user", text: prompt }],
      undefined,
      { model: mapping.model, maxTokens: 2048 },
    );
    return collectStream(result.stream);
  }

  if (mapping.provider === "claude") {
    const { ClaudeProvider } = await import("@/lib/llm/providers/claude");
    const provider = new ClaudeProvider();
    const result = await provider.generateStream(
      [{ role: "user", text: prompt }],
      undefined,
      { model: mapping.model, maxTokens: 2048 },
    );
    return collectStream(result.stream);
  }

  throw new Error(`Unsupported provider mapping: ${mapping.provider}`);
}
