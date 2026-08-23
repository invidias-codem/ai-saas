import type { PersonaDocument } from "./persona-schema";
import type { BoundaryCriticRequest, BoundaryCriticResponse } from "./persona-schema";
import { evaluateNamespaces } from "./namespace-evaluator";

export class BoundaryCritic {
  constructor(private activePersona: PersonaDocument) {}

  evaluate(request: BoundaryCriticRequest): BoundaryCriticResponse {
    const interceptNonce = request.interceptNonce;

    // 1. Namespace intersection (deterministic set math, zero LLM overhead)
    const namespaceEval = evaluateNamespaces({
      retrievedChunks: request.candidateOutput ? [{ namespace: request.candidateOutput }] : [],
      activePersona: this.activePersona,
    });

    if (namespaceEval.decision === "HARD_BLOCK") {
      return {
        decision: "HARD_BLOCK",
        causalViolations: namespaceEval.violations,
        auditTrail: {
          interceptNonce,
          fallbackAction: "TERMINATE_SESSION",
        },
      };
    }

    if (namespaceEval.decision === "BORDERLINE") {
      // Ceiling enforcement: at HIGH_COMPUTE, BORDERLINE becomes HARD_BLOCK
      if (request.routeTier === "HIGH_COMPUTE") {
        return {
          decision: "HARD_BLOCK",
          causalViolations: [
            ...namespaceEval.violations,
            {
              namespaceRule: "ceiling-enforcement",
              thresholdDelta: 1.0,
              driftDescription: "Untrusted RAG context detected while operating at HIGH_COMPUTE ceiling. Escalated to HARD_BLOCK.",
            },
          ],
          auditTrail: {
            interceptNonce,
            fallbackAction: "TERMINATE_SESSION",
          },
        };
      }

      return {
        decision: "BORDERLINE",
        causalViolations: namespaceEval.violations,
        auditTrail: {
          interceptNonce,
          fallbackAction: "DEGRADE",
          degradedReason: namespaceEval.violations[0]?.driftDescription ?? "Context contains untrusted or untagged chunks",
          userPromptedForElevation: true,
        },
      };
    }

    // 4. PASS
    return {
      decision: "PASS",
      causalViolations: [],
      auditTrail: {
        interceptNonce,
        fallbackAction: "DISPATCH",
      },
    };
  }
}
