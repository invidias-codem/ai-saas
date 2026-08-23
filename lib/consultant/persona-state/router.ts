import { z } from "zod";
import type { PersonaDocument } from "./persona-schema";
import { ProviderHealthChecker } from "./provider-health";


export const TaskType = z.enum([
  "RAG_SUMMARIZATION",
  "CODE_GENERATION",
  "CODE_REVIEW",
  "CLINICAL_ADVICE",
  "DATA_QUERY",
  "EMBEDDING_INDEX",
  "GRAPH_EXTRACTION",
  "CONSOLIDATION",
  "REFLECTION",
  "DIAGNOSTICS",
  "AUDIT_LOG_QUERY",
  "SESSION_REPLAY",
  "SYSTEM_ADMIN",
]);

export type TaskType = z.infer<typeof TaskType>;

export const TierFloor = z.enum(["BASE", "STANDARD", "HIGH_COMPUTE"]);

export type TierFloor = z.infer<typeof TierFloor>;

export const TASK_TIER_REQUIREMENTS: Record<TaskType, TierFloor> = {
  RAG_SUMMARIZATION: "STANDARD",
  CODE_GENERATION: "STANDARD",
  CODE_REVIEW: "BASE",
  CLINICAL_ADVICE: "HIGH_COMPUTE",
  DATA_QUERY: "BASE",
  EMBEDDING_INDEX: "BASE",
  GRAPH_EXTRACTION: "STANDARD",
  CONSOLIDATION: "HIGH_COMPUTE",
  REFLECTION: "STANDARD",
  DIAGNOSTICS: "BASE",
  AUDIT_LOG_QUERY: "BASE",
  SESSION_REPLAY: "BASE",
  SYSTEM_ADMIN: "HIGH_COMPUTE",
};

export const PROVIDER_FALLBACK_CHAINS: Record<TierFloor, string[]> = {
  BASE: [
    "openrouter-auto",
    "anthropic-haiku",
    "gemini-flash",
  ],
  STANDARD: [
    "anthropic-sonnet",
    "openrouter-mid",
    "gemini-pro",
  ],
  HIGH_COMPUTE: [
    "anthropic-opus",
    "openrouter-heavy",
    "gemini-ultra",
  ],
};

export interface RouterRequest {
  taskType: TaskType;
  prompt: string;
  contextTokens: number;
  requestedTier?: TierFloor;
}

export interface RouterResponse {
  tier: TierFloor;
  provider: string;
  model: string;
  downgraded?: boolean;
  originalTier?: TierFloor;
}

export class UnifiedContextOrchestrator {
  constructor(
    private readonly activePersona: PersonaDocument,
    private readonly providerHealth: ProviderHealthChecker,
  ) {}

  route(request: RouterRequest): RouterResponse {
    const minTier = TASK_TIER_REQUIREMENTS[request.taskType];

    if (request.requestedTier) {
      if (request.taskType !== "SYSTEM_ADMIN") {
        throw new Error(
          `Tier override not permitted for task type ${request.taskType}`,
        );
      }
    }

    const resolvedTier = request.requestedTier ?? minTier;

    const chain = PROVIDER_FALLBACK_CHAINS[resolvedTier];
    for (const providerKey of chain) {
      if (this.providerHealth.isAvailable(providerKey)) {
        const model = this.providerHealth.getModel(providerKey);
        return {
          tier: resolvedTier,
          provider: providerKey,
          model,
          ...(request.requestedTier && request.requestedTier !== minTier
            ? { downgraded: false }
            : {}),
        };
      }
    }

    if (resolvedTier === "STANDARD") {
      const highChain = PROVIDER_FALLBACK_CHAINS["HIGH_COMPUTE"];
      for (const providerKey of highChain) {
        if (this.providerHealth.isAvailable(providerKey)) {
          return {
            tier: "HIGH_COMPUTE",
            provider: providerKey,
            model: this.providerHealth.getModel(providerKey),
            downgraded: true,
            originalTier: "STANDARD",
          };
        }
      }
    }

    throw new Error(
      `No providers available for tier ${resolvedTier} (task: ${request.taskType})`,
    );
  }
}
