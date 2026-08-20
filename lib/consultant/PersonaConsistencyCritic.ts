// lib/consultant/PersonaConsistencyCritic.ts
// Lightweight, fast persona drift detection for the Chameleon Consultant.
//
// Runs in parallel with the existing OutputCritic to catch persona drift
// that slips past the pre-generation domain gate. Uses a fast model
// (Gemini 1.5 Flash) to minimize latency impact.
//
// Returns a categorical verdict: CONSISTENT, DRIFT_DETECTED, or SEVERE_VIOLATION.

import { PersonaSession } from "./personaSession";
import { CURATED_PERSONAS } from "@/lib/constants/personas";

export type PersonaDriftLevel = "CONSISTENT" | "DRIFT_DETECTED" | "SEVERE_VIOLATION";

export interface PersonaCriticResult {
  driftLevel: PersonaDriftLevel;
  reason: string;
  latencyMs: number;
}

/** Fast critic model — optimized for speed over depth */
const PERSONA_CRITIC_MODEL = "gemini-1.5-flash";

/**
 * Evaluate whether a generated response maintains persona consistency.
 *
 * Uses a lightweight heuristic first (keyword matching), then falls back
 * to LLM evaluation for borderline cases. This minimizes token spend.
 */
export async function evaluatePersonaConsistency(
  session: PersonaSession,
  userQuery: string,
  generatedResponse: string
): Promise<PersonaCriticResult> {
  const start = Date.now();

  // Fast-path heuristic: check if response contains persona-inappropriate signals
  const heuristicResult = heuristicPersonaCheck(session, userQuery, generatedResponse);
  if (heuristicResult) {
    return { ...heuristicResult, latencyMs: Date.now() - start };
  }

  // Fallback: LLM-based evaluation for nuanced cases
  try {
    const llmResult = await llmPersonaEvaluation(session, userQuery, generatedResponse);
    return { ...llmResult, latencyMs: Date.now() - start };
  } catch {
    // Fail open — critic must never break the hot path
    return { driftLevel: "CONSISTENT", reason: "Critic unavailable", latencyMs: Date.now() - start };
  }
}

/**
 * Heuristic persona check — fast, zero-token, deterministic.
 * Returns null if the result is ambiguous (needs LLM fallback).
 */
function heuristicPersonaCheck(
  session: PersonaSession,
  userQuery: string,
  generatedResponse: string
): Omit<PersonaCriticResult, "latencyMs"> | null {
  const responseLower = generatedResponse.toLowerCase();

  // Check for explicit persona-breaking phrases
  const breakingPhrases = [
    "as an ai",
    "i'm just an ai",
    "i don't have personal",
    "i cannot maintain",
    "i am not actually",
    "breaking character",
    "out of character",
  ];

  for (const phrase of breakingPhrases) {
    if (responseLower.includes(phrase)) {
      return {
        driftLevel: "SEVERE_VIOLATION",
        reason: `Response contains persona-breaking phrase: "${phrase}"`,
      };
    }
  }

  // Check for severe domain mismatch (response completely ignores persona)
  const persona = CURATED_PERSONAS.find((p) => p.id === session.personaId);
  if (persona && session.personaId !== "custom") {
    const responseWords = responseLower.split(/\s+/);
    const tags = persona.tags.map((t) => t.toLowerCase());

    // Count how many persona domain terms appear in response
    let domainTermCount = 0;
    for (const tag of tags) {
      const tagTokens = tag.split(/\s+/);
      for (const token of tagTokens) {
        if (responseWords.includes(token)) {
          domainTermCount++;
          break;
        }
      }
    }

    // If response is long but contains almost no domain terms, flag as potential drift
    if (responseWords.length > 100 && domainTermCount === 0) {
      return {
        driftLevel: "DRIFT_DETECTED",
        reason: `Response lacks domain terminology for ${persona.role}`,
      };
    }
  }

  // Ambiguous — needs LLM evaluation
  return null;
}

/**
 * LLM-based persona evaluation for nuanced cases.
 * Only called when heuristic check is inconclusive.
 */
async function llmPersonaEvaluation(
  session: PersonaSession,
  userQuery: string,
  response: string
): Promise<Omit<PersonaCriticResult, "latencyMs">> {
  const persona = CURATED_PERSONAS.find((p) => p.id === session.personaId);
  const personaDesc = persona
    ? `${persona.role}: ${persona.title}. Expertise: ${persona.tags.join(", ")}`
    : session.customContent || "Custom workspace persona";

  const prompt = `Evaluate whether the following AI response maintains consistency with its assigned persona.

PERSONA: ${personaDesc}

USER QUERY: ${userQuery.substring(0, 500)}

AI RESPONSE: ${response.substring(0, 1500)}

Rate the response as exactly ONE of:
- CONSISTENT: Response maintains persona, stays in character, uses domain-appropriate language
- DRIFT_DETECTED: Response partially drifts outside persona domain but is not severely broken
- SEVERE_VIOLATION: Response completely breaks character, contradicts persona, or provides dangerous cross-domain advice

Return ONLY valid JSON:
{"driftLevel": "CONSISTENT|DRIFT_DETECTED|SEVERE_VIOLATION", "reason": "brief explanation"}`;

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
    const model = client.getGenerativeModel({
      model: PERSONA_CRITIC_MODEL,
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    // Parse JSON from response
    const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(cleaned);

    const driftLevel = parsed.driftLevel as PersonaDriftLevel;
    if (!["CONSISTENT", "DRIFT_DETECTED", "SEVERE_VIOLATION"].includes(driftLevel)) {
      return { driftLevel: "CONSISTENT", reason: "Invalid critic response" };
    }

    return { driftLevel, reason: parsed.reason || "No reason provided" };
  } catch {
    return { driftLevel: "CONSISTENT", reason: "LLM evaluation failed" };
  }
}
