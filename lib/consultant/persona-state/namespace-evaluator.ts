import type { PersonaDocument } from "./persona-schema";

export interface NamespaceEvaluationInput {
  retrievedChunks: Array<{ namespace: string }>;
  activePersona: PersonaDocument;
}

export interface NamespaceEvaluationResult {
  decision: "PASS" | "BORDERLINE" | "HARD_BLOCK";
  violations: Array<{
    namespaceRule: string;
    thresholdDelta: number;
    driftDescription: string;
  }>;
  observedNamespaces: string[];
  allowedIntersection: string[];
  forbiddenIntersection: string[];
}

/**
 * Strict namespace intersection evaluator.
 *
 * Rules:
 * 1. If any forbidden namespace appears in retrieved chunks → HARD_BLOCK
 * 2. If no forbidden namespaces, but some chunks lack a namespace → BORDERLINE
 *    (untrusted content is present, but not explicitly forbidden)
 * 3. If all chunks have allowed namespaces → PASS
 */
export function evaluateNamespaces(
  input: NamespaceEvaluationInput,
): NamespaceEvaluationResult {
  const { retrievedChunks, activePersona } = input;
  const allowed = new Set(activePersona.domainBoundaries.allowedNamespaces);
  const forbidden = new Set(activePersona.domainBoundaries.forbiddenNamespaces);

  const observed = new Set<string>();
  const allowedIntersection = new Set<string>();
  const forbiddenIntersection = new Set<string>();
  const untagged: string[] = [];

  for (const chunk of retrievedChunks) {
    const ns = chunk.namespace;
    if (!ns) {
      untagged.push(chunk.namespace ?? "(null)");
      continue;
    }
    observed.add(ns);
    if (forbidden.has(ns)) {
      forbiddenIntersection.add(ns);
    } else if (allowed.has(ns)) {
      allowedIntersection.add(ns);
    }
  }

  const violations: NamespaceEvaluationResult["violations"] = [];

  if (forbiddenIntersection.size > 0) {
    for (const ns of forbiddenIntersection) {
      violations.push({
        namespaceRule: `forbidden:${ns}`,
        thresholdDelta: 1.0,
        driftDescription: `Retrieved context contains forbidden namespace "${ns}"`,
      });
    }
    return {
      decision: "HARD_BLOCK",
      violations,
      observedNamespaces: Array.from(observed),
      allowedIntersection: Array.from(allowedIntersection),
      forbiddenIntersection: Array.from(forbiddenIntersection),
    };
  }

  if (untagged.length > 0) {
    violations.push({
      namespaceRule: "untrusted:missing-tag",
      thresholdDelta: untagged.length / retrievedChunks.length,
      driftDescription: `${untagged.length} of ${retrievedChunks.length} retrieved chunks lack a verified namespace tag`,
    });
    return {
      decision: "BORDERLINE",
      violations,
      observedNamespaces: Array.from(observed),
      allowedIntersection: Array.from(allowedIntersection),
      forbiddenIntersection: [],
    };
  }

  return {
    decision: "PASS",
    violations: [],
    observedNamespaces: Array.from(observed),
    allowedIntersection: Array.from(allowedIntersection),
    forbiddenIntersection: [],
  };
}
