// app/api/weaver/retry/route.ts
// Elevated retry endpoint for BORDERLINE dispatches.
// Forces HIGH_COMPUTE tier evaluation. If the critic still returns
// BORDERLINE, ceiling enforcement automatically escalates to HARD_BLOCK.

import { NextResponse } from "next/server";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import {
  PersonaStateMachine,
} from "@/lib/consultant/persona-state/state-machine.js";
import { BoundaryCritic } from "@/lib/consultant/persona-state/boundary-critic.js";
import type { SupabaseKV } from "@/lib/state/kv.js";
import { timingSafeCompare } from "@/lib/auth";

const RetryRequestSchema = z.object({
  interceptNonce: z.string().uuid(),
  candidateOutput: z.string().min(1).max(1_000_000),
});

export const runtime = "nodejs";

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
  const { createStateKV } = await import("@/lib/state/kv.js");
  const kv = createStateKV();

  const stored = await kv.getCurrentPersona();
  if (stored) {
    const { PersonaChainVerifier } = await import(
      "@/lib/consultant/persona-state/persona-schema.js"
    );
    const verifier = new PersonaChainVerifier(
      stored.previous_version_hash ?? stored.signature_hash,
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

  const signedConfigRaw = process.env.LATTICE_SIGNED_CONFIG;
  if (!signedConfigRaw) {
    throw new Error("No persona state found and LATTICE_SIGNED_CONFIG is not set");
  }

  const signedConfig = JSON.parse(signedConfigRaw);
  const { initializePersonaStateMachine } = await import(
    "@/lib/consultant/persona-state/state-machine.js"
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

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.AGENTMEMORY_SECRET;

  if (secret && (!authHeader || !timingSafeCompare(authHeader, `Bearer ${secret}`))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RetryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { interceptNonce, candidateOutput } = parsed.data;

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

  if (activePersona.state !== "CONSULTING") {
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

  // Re-evaluate at HIGH_COMPUTE ceiling — BORDERLINE becomes HARD_BLOCK
  const critic = new BoundaryCritic(activePersona);
  const criticResult = critic.evaluate({
    candidateOutput,
    activePersonaState: activePersona,
    routeTier: "HIGH_COMPUTE",
    interceptNonce,
  });

  await appendAudit(kv, criticResult.auditTrail.interceptNonce, "ELEVATED_RETRY", criticResult.decision, {
    criticDecision: criticResult.decision,
    violations: criticResult.causalViolations,
    taskType: "SYSTEM_ADMIN",
    sessionId: interceptNonce,
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
      // Ignore transition failure — HARD_BLOCK response is authoritative
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
          "Elevated retry failed — ceiling enforcement",
      },
      { status: 403 },
    );
  }

  // PASS at HIGH_COMPUTE — the context is now trusted
  return NextResponse.json(
    {
      decision: "DISPATCHED",
      personaState: activePersona.state,
      criticDecision: "PASS",
      causalViolations: [],
      auditNonce: criticResult.auditTrail.interceptNonce,
      timestamp: new Date().toISOString(),
      response: `[Elevated retry approved — HIGH_COMPUTE tier active]`,
    },
    { status: 200 },
  );
}

