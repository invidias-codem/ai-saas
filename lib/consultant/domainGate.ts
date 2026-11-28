// lib/consultant/domainGate.ts
// Threshold-based domain gate for the Chameleon Consultant layer.
//
// Three-tier routing based on persona-domain confidence:
//   < 0.30  → HARD BLOCK (zero-token templated refusal)
//   0.30-0.65 → BORDERLINE (pass-through with outOfDomain flag)
//   > 0.65  → STANDARD (normal inference)
//
// This preserves token economics for obvious violations while maintaining
// the persona illusion for nuanced edge cases.

import { PersonaSession } from "./personaSession";
import { CURATED_PERSONAS } from "@/lib/constants/personas";

/** Confidence thresholds for the domain gate */
export const DOMAIN_THRESHOLDS = {
  HARD_BLOCK: 0.30,
  BORDERLINE: 0.65,
} as const;

export type DomainGateAction = "hard_block" | "borderline" | "standard";

export interface DomainGateResult {
  action: DomainGateAction;
  confidence: number;
  refusalMessage?: string;
}

/**
 * Calculate domain confidence score for a query against a persona.
 * Uses tag overlap as a lightweight heuristic.
 */
export function calculateDomainConfidence(
  session: PersonaSession,
  query: string
): number {
  const persona = CURATED_PERSONAS.find((p) => p.id === session.personaId);
  if (!persona) return 0;

  // Custom personas: use a simpler heuristic
  if (session.personaId === "custom" && session.customContent) {
    return calculateCustomPersonaConfidence(session.customContent, query);
  }

  const q = query.toLowerCase();
  const tags = persona.tags.map((t) => t.toLowerCase());

  // Check for tag matches
  let matchCount = 0;
  for (const tag of tags) {
    // Split multi-word tags into individual tokens for partial matching
    const tagTokens = tag.split(/\s+/);
    for (const token of tagTokens) {
      if (q.includes(token)) {
        matchCount++;
        break;
      }
    }
  }

  // Calculate confidence as ratio of matched tags
  const baseConfidence = tags.length > 0 ? matchCount / tags.length : 0;

  // Boost for persona role/description keyword matches
  const roleTokens = persona.role.toLowerCase().split(/\s+/);
  let roleBoost = 0;
  for (const token of roleTokens) {
    if (q.includes(token)) {
      roleBoost += 0.1;
    }
  }

  return Math.min(1.0, baseConfidence + roleBoost);
}

/**
 * Calculate confidence for custom workspace personas.
 * Uses content keyword extraction.
 */
function calculateCustomPersonaConfidence(
  customContent: string,
  query: string
): number {
  const contentLower = customContent.toLowerCase();
  const q = query.toLowerCase();

  // Extract key terms from persona content (simple TF approach)
  const contentTokens = contentLower.split(/\s+/);
  const queryTokens = q.split(/\s+/);

  let matchCount = 0;
  for (const token of queryTokens) {
    if (token.length > 3 && contentTokens.includes(token)) {
      matchCount++;
    }
  }

  return queryTokens.length > 0
    ? Math.min(1.0, (matchCount / queryTokens.length) * 1.5)
    : 0.5;
}

/**
 * Evaluate the domain gate for a query and return the appropriate action.
 */
export function evaluateDomainGate(
  session: PersonaSession,
  query: string
): DomainGateResult {
  const confidence = calculateDomainConfidence(session, query);

  if (confidence < DOMAIN_THRESHOLDS.HARD_BLOCK) {
    return {
      action: "hard_block",
      confidence,
      refusalMessage: generateRefusalMessage(session),
    };
  }

  if (confidence < DOMAIN_THRESHOLDS.BORDERLINE) {
    return {
      action: "borderline",
      confidence,
    };
  }

  return {
    action: "standard",
    confidence,
  };
}

/**
 * Generate a templated, zero-token refusal message for hard-blocked queries.
 */
function generateRefusalMessage(session: PersonaSession): string {
  const persona = CURATED_PERSONAS.find((p) => p.id === session.personaId);

  if (session.personaId === "custom" && session.customContent) {
    return `This query falls outside the expertise of the active consultant. The current consultant specializes in: ${session.customContent.substring(0, 100)}... Please ask a relevant question or switch to a different consultant.`;
  }

  if (!persona) {
    return "This query falls outside the expertise of the active consultant. Please ask a relevant question or switch consultants.";
  }

  return `This query falls outside the domain expertise of the ${persona.role}. This consultant specializes in: ${persona.tags.join(", ")}. Please ask a question related to their expertise, or switch to a different consultant for this topic.`;
}
