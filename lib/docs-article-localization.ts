import type { DocsLanguage } from "./docs-hub-translations";

/** Explicit allowlist: fall back to original English references when a translation is absent. */
export const TRANSLATED_DOCS_ARTICLES = [
  "docs/README.md",
  "docs/operations/self-hosted-preflight-checklist.md",
  // Architecture
  "docs/architecture/system-architecture.md",
  "docs/architecture/runtime-mode-routing.md",
  "docs/architecture/memory-and-context-architecture.md",
  "docs/architecture/workspace-operating-profile-model.md",
  "docs/architecture/retrieval-and-graph-strategy.md",
  // Reference
  "docs/reference/api-reference.md",
  "docs/reference/environment-variables.md",
  "docs/reference/request-response-examples.md",
  "docs/reference/source-file-map.md",
  // Security
  "docs/security/public-routes.md",
  "docs/security/trust-boundaries.md",
] as const;
const translatedPaths: ReadonlySet<string> = new Set(TRANSLATED_DOCS_ARTICLES);

export function resolveDocsArticlePath(path: string, language: DocsLanguage): string {
  if (language === "en" || !translatedPaths.has(path)) return path;
  return `docs/translations/${language}/${path.slice("docs/".length)}`;
}
