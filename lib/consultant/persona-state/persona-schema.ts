import { z } from "zod";

// ── Strict State Enumeration ─────────────────────────────────────────
export const PersonaStateValues = ["IDLE", "INGESTING", "CONSULTING", "HALTED"] as const;
export type PersonaState = typeof PersonaStateValues[number];
export const PersonaStateSchema: z.ZodType<PersonaState> = z.enum(PersonaStateValues);

// ── Persona Document Schema ─────────────────────────────────────────
const UuidV7 = z.string().uuid();
const Sha256 = z.string().length(64);
const UtcDatetime = z.string().datetime();

export const PersonaDocumentSchema = z.object({
  documentId: UuidV7,
  nonce: UuidV7,
  previousVersionHash: Sha256,
  signatureHash: Sha256,
  state: PersonaStateSchema,
  domainBoundaries: z.object({
    allowedNamespaces: z.array(z.string()),
    forbiddenNamespaces: z.array(z.string()),
    toneLock: z.enum(["CLINICAL", "PREMIUM_CONSULTANT", "RESTRICTED"]),
  }),
  transitionAudit: z.object({
    triggerEvent: z.string().max(256),
    timestamp: UtcDatetime,
  }),
}).strict();

export type PersonaDocument = z.infer<typeof PersonaDocumentSchema>;

// ── Chain Link ──────────────────────────────────────────────────────
export interface ChainLink {
  nonce: string;
  versionHash: string;
  previousVersionHash: string;
  timestamp: string;
}

// ── Chain Verifier ──────────────────────────────────────────────────
export class PersonaChainVerifier {
  constructor(private readonly genesisHash: string) {}

  verifyLink(link: ChainLink): boolean {
    if (link.previousVersionHash === link.versionHash) {
      return link.previousVersionHash === this.genesisHash;
    }
    return this.validatePreviousInStore(link.previousVersionHash);
  }

  protected validatePreviousInStore(_previousHash: string): boolean {
    throw new Error("Chain verification requires store implementation");
  }
}

// ── Boundary Critic Types ───────────────────────────────────────────
export const CriticRouteTier = z.enum(["STANDARD", "HIGH_COMPUTE"]);

export const BoundaryCriticRequestSchema = z.object({
  candidateOutput: z.string().min(1).max(1_000_000),
  activePersonaState: PersonaDocumentSchema,
  routeTier: CriticRouteTier,
  assertedNamespaces: z.array(z.string()).optional(),
  interceptNonce: UuidV7,
});

export type BoundaryCriticRequest = z.infer<typeof BoundaryCriticRequestSchema>;

export const CriticFallbackAction = z.enum([
  "DISPATCH",
  "DEGRADE",
  "TERMINATE_SESSION",
]);

export const CausalViolationSchema = z.object({
  namespaceRule: z.string(),
  thresholdDelta: z.number(),
  driftDescription: z.string(),
});

export const CriticAuditTrailSchema = z.object({
  interceptNonce: UuidV7,
  fallbackAction: CriticFallbackAction,
  degradedReason: z.string().optional(),
  userPromptedForElevation: z.boolean().optional(),
  supersedesNonce: UuidV7.optional(),
});

export const CriticDecision = z.enum(["PASS", "BORDERLINE", "HARD_BLOCK"]);

export const BoundaryCriticResponseSchema = z.object({
  decision: CriticDecision,
  causalViolations: z.array(CausalViolationSchema),
  auditTrail: CriticAuditTrailSchema,
}).strict();

export type BoundaryCriticResponse = z.infer<typeof BoundaryCriticResponseSchema>;

// ── Transition Matrix ───────────────────────────────────────────────
export type TransitionName =
  | "IDLE_TO_INGESTING"
  | "INGESTING_TO_CONSULTING"
  | "CONSULTING_TO_IDLE"
  | "CONSULTING_TO_HALTED"
  | "HALTED_TO_IDLE"
  | "INGESTING_TO_IDLE"
  | "HALTED_TO_CONSULTING";

export interface TransitionRule {
  from: PersonaState;
  to: PersonaState;
  name: TransitionName;
  chainDepthRequired: number;
  requiresDomainBoundaries: boolean;
  requiresAuthorizedTrigger: boolean;
  forbiddenGuard: boolean;
}

export const TRANSITION_MATRIX: Record<TransitionName, TransitionRule> = {
  IDLE_TO_INGESTING: {
    from: "IDLE",
    to: "INGESTING",
    name: "IDLE_TO_INGESTING",
    chainDepthRequired: 0,
    requiresDomainBoundaries: true,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: true,
  },
  INGESTING_TO_CONSULTING: {
    from: "INGESTING",
    to: "CONSULTING",
    name: "INGESTING_TO_CONSULTING",
    chainDepthRequired: 1,
    requiresDomainBoundaries: true,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: true,
  },
  CONSULTING_TO_IDLE: {
    from: "CONSULTING",
    to: "IDLE",
    name: "CONSULTING_TO_IDLE",
    chainDepthRequired: 1,
    requiresDomainBoundaries: false,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: true,
  },
  CONSULTING_TO_HALTED: {
    from: "CONSULTING",
    to: "HALTED",
    name: "CONSULTING_TO_HALTED",
    chainDepthRequired: 1,
    requiresDomainBoundaries: true,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: false,
  },
  HALTED_TO_IDLE: {
    from: "HALTED",
    to: "IDLE",
    name: "HALTED_TO_IDLE",
    chainDepthRequired: 2,
    requiresDomainBoundaries: true,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: true,
  },
  INGESTING_TO_IDLE: {
    from: "INGESTING",
    to: "IDLE",
    name: "INGESTING_TO_IDLE",
    chainDepthRequired: 1,
    requiresDomainBoundaries: true,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: true,
  },
  HALTED_TO_CONSULTING: {
    from: "HALTED",
    to: "CONSULTING",
    name: "HALTED_TO_CONSULTING",
    chainDepthRequired: 2,
    requiresDomainBoundaries: true,
    requiresAuthorizedTrigger: true,
    forbiddenGuard: true,
  },
};

export const ALLOWED_TRANSITIONS = Object.values(TRANSITION_MATRIX);

// ── Authorized Triggers ─────────────────────────────────────────────
export const AUTHORIZED_TRIGGERS = z.enum([
  "SYSTEM_BOOT",
  "USER_SESSION_START",
  "INGESTION_COMPLETE",
  "CONSULTATION_COMPLETE",
  "BOUNDARY_VIOLATION",
  "OPERATOR_RESUME",
  "GRACEFUL_SHUTDOWN",
]);

export type AuthorizedTrigger = z.infer<typeof AUTHORIZED_TRIGGERS>;

export const AUTHORIZED_TRIGGER_VALUES = [
  "SYSTEM_BOOT",
  "USER_SESSION_START",
  "INGESTION_COMPLETE",
  "CONSULTATION_COMPLETE",
  "BOUNDARY_VIOLATION",
  "OPERATOR_RESUME",
  "GRACEFUL_SHUTDOWN",
] as const;

export type AuthorizedTriggerValue = typeof AUTHORIZED_TRIGGER_VALUES[number];

export function validateTrigger(trigger: string): trigger is AuthorizedTrigger {
  return AUTHORIZED_TRIGGERS.safeParse(trigger).success;
}

// ── Transition Validation Result ─────────────────────────────────────
export interface TransitionValidationResult {
  valid: boolean;
  rule?: TransitionRule;
  reason?: string;
}

export function validateTransition(
  currentState: PersonaDocument,
  proposedState: PersonaDocument,
  chainVerifier: PersonaChainVerifier,
  assertedNamespaces: string[] = [],
): TransitionValidationResult {
  if (currentState.state === proposedState.state) {
    return { valid: false, reason: "No-op state transition rejected" };
  }

  const rule = ALLOWED_TRANSITIONS.find(
    (t) => t.from === currentState.state && t.to === proposedState.state,
  );

  if (!rule) {
    return {
      valid: false,
      reason: `Transition ${currentState.state} -> ${proposedState.state} is not in the matrix`,
    };
  }

  // 1. Nonce monotonicity (UUID v7)
  if (proposedState.nonce <= currentState.nonce) {
    return { valid: false, rule, reason: "Nonce must monotonically increase" };
  }

  // 2. Chain link: previousVersionHash must match current signatureHash
  if (proposedState.previousVersionHash !== currentState.signatureHash) {
    return {
      valid: false,
      rule,
      reason: "previousVersionHash does not match current signatureHash",
    };
  }

  // 3. Chain depth: verify enough prior links exist in the store
  const chainOk = chainVerifier.verifyLink({
    nonce: proposedState.nonce,
    versionHash: proposedState.signatureHash,
    previousVersionHash: proposedState.previousVersionHash,
    timestamp: proposedState.transitionAudit.timestamp,
  });

  if (!chainOk) {
    return {
      valid: false,
      rule,
      reason: `Chain depth ${rule.chainDepthRequired} verification failed`,
    };
  }

  // 4. Domain boundaries
  if (rule.requiresDomainBoundaries) {
    const boundaries = proposedState.domainBoundaries;
    if (
      !boundaries ||
      boundaries.allowedNamespaces.length === 0 ||
      boundaries.forbiddenNamespaces.length === 0
    ) {
      return {
        valid: false,
        rule,
        reason: "Domain boundaries are required for this transition",
      };
    }
  }

  // 5. Authorized trigger
  if (rule.requiresAuthorizedTrigger) {
    if (!validateTrigger(proposedState.transitionAudit.triggerEvent)) {
      return {
        valid: false,
        rule,
        reason: `Unauthorized trigger: ${proposedState.transitionAudit.triggerEvent}`,
      };
    }
  }

  // 6. Forbidden namespace guard
  if (rule.forbiddenGuard && assertedNamespaces.length > 0) {
    const forbidden = proposedState.domainBoundaries.forbiddenNamespaces;
    const violation = assertedNamespaces.find((ns) =>
      forbidden.some((f) => ns === f || ns.startsWith(`${f}.`)),
    );
    if (violation) {
      return {
        valid: false,
        rule,
        reason: `Asserted namespace ${violation} is forbidden by persona boundaries`,
      };
    }
  }

  return { valid: true, rule };
}
