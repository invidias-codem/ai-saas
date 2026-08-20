// lib/consultant/personaSession.ts
// Persona session state for the Chameleon Consultant layer.
// Tracks active persona, enforces domain boundaries, and provides
// tamper-evident boundaries for system-prompt injection.

import { CURATED_PERSONAS, Persona } from "@/lib/constants/personas";

export interface PersonaSession {
  /** Stable identifier for this persona session */
  sessionId: string;
  /** The active persona definition (curated persona ID, or 'custom' for workspace-generated) */
  personaId: string;
  /** Custom persona content (used when personaId === 'custom') */
  customContent?: string;
  /** When the persona was activated (ISO 8601) */
  injectedAt: string;
  /** Random nonce — prevents user-injected closing tags from being trusted */
  nonce: string;
  /** Conversation turn count under this persona */
  turnCount: number;
  /** Minimum model tier this persona requires */
  minimumModelTier: "fast" | "quality" | "reasoning";
  /** Whether the persona has been domain-verified by the OutputCritic */
  domainVerified: boolean;
}

/** Generate a cryptographically random nonce for the persona boundary */
function generateNonce(): string {
  // Use crypto.randomUUID for collision resistance
  return crypto.randomUUID();
}

/**
 * Create a new PersonaSession for the given persona.
 * The nonce ensures that only the system can close the persona XML block —
 * any user-injected `</persona_directive>` tags will have a different nonce
 * and are explicitly ignored by the model.
 */
export function createPersonaSession(
  personaId: string,
  sessionId: string,
  customContent?: string
): PersonaSession {
  // Validate: either a curated persona or custom content must be provided
  const isCurated = CURATED_PERSONAS.some((p) => p.id === personaId);
  const isCustom = personaId === "custom" && customContent;

  if (!isCurated && !isCustom) {
    throw new Error(`Unknown persona: ${personaId}`);
  }

  return {
    sessionId,
    personaId,
    customContent,
    injectedAt: new Date().toISOString(),
    nonce: generateNonce(),
    turnCount: 0,
    minimumModelTier: resolvePersonaModelTier(personaId, customContent),
    domainVerified: false,
  };
}

/**
 * Map persona to its minimum required model tier.
 * Custom personas default to 'quality' for nuanced language generation.
 */
function resolvePersonaModelTier(
  personaId: string,
  customContent?: string
): "fast" | "quality" | "reasoning" {
  // Custom workspace personas get quality tier by default
  if (personaId === "custom") {
    // If custom content mentions security/infrastructure, bump to reasoning
    const c = customContent?.toLowerCase() ?? "";
    if (c.includes("security") || c.includes("infrastructure") || c.includes("architect")) {
      return "reasoning";
    }
    return "quality";
  }

  const persona = CURATED_PERSONAS.find((p) => p.id === personaId);
  if (!persona) return "quality";

  // DevOps security and architecture review require deeper reasoning
  if (
    persona.id === "devops-security-reviewer" ||
    persona.id === "headless-commerce-architect"
  ) {
    return "reasoning";
  }
  // Sales strategist and market analyst benefit from quality models
  if (
    persona.id === "b2b-sales-strategist" ||
    persona.id === "local-market-analyst"
  ) {
    return "quality";
  }
  return "fast";
}

/**
 * Check if a query is within the persona's defined domain.
 * Uses the persona tags as a lightweight domain classifier.
 */
export function isWithinPersonaDomain(
  session: PersonaSession,
  query: string
): boolean {
  const persona = CURATED_PERSONAS.find((p) => p.id === session.personaId);
  if (!persona) return false;

  const q = query.toLowerCase();
  // If any persona tag appears in the query, it's within domain
  return persona.tags.some((tag) => q.includes(tag.toLowerCase()));
}
