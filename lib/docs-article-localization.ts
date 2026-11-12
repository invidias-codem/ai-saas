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
  // Operations (Slice 7A - Deployment Foundations)
  "docs/operations/deployment-modes.md",
  "docs/operations/deployment.md",
  "docs/operations/self-hosted-topology.md",
] as const;

/** Per-language availability for each allowlisted document.
 *  True = translation exists for this language.
 *  Missing keys default to false (fall back to English).
 */
export const DOCS_TRANSLATION_AVAILABILITY: Record<string, Partial<Record<DocsLanguage, boolean>>> = {
  // Fully translated (5 languages: es, fr, de, th, vi)
  "docs/README.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/operations/self-hosted-preflight-checklist.md": { es: true, fr: true, de: true, th: true, vi: true },
  // Architecture (5 languages)
  "docs/architecture/system-architecture.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/architecture/runtime-mode-routing.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/architecture/memory-and-context-architecture.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/architecture/workspace-operating-profile-model.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/architecture/retrieval-and-graph-strategy.md": { es: true, fr: true, de: true, th: true, vi: true },
  // Reference (5 languages)
  "docs/reference/api-reference.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/reference/environment-variables.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/reference/request-response-examples.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/reference/source-file-map.md": { es: true, fr: true, de: true, th: true, vi: true },
  // Security (5 languages)
  "docs/security/public-routes.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/security/trust-boundaries.md": { es: true, fr: true, de: true, th: true, vi: true },
  // Operations (Slice 7A - Deployment Foundations, 5 languages)
  "docs/operations/deployment-modes.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/operations/deployment.md": { es: true, fr: true, de: true, th: true, vi: true },
  "docs/operations/self-hosted-topology.md": { es: true, fr: true, de: true, th: true, vi: true },
};

const translatedPaths: ReadonlySet<string> = new Set(TRANSLATED_DOCS_ARTICLES);

export function isTranslationAvailable(path: string, language: DocsLanguage): boolean {
  if (language === "en") return true;
  const availability = DOCS_TRANSLATION_AVAILABILITY[path];
  if (!availability) return false;
  return availability[language] === true;
}

export function resolveDocsArticlePath(path: string, language: DocsLanguage): string {
  if (language === "en" || !translatedPaths.has(path) || !isTranslationAvailable(path, language)) {
    return path;
  }
  return `docs/translations/${language}/${path.slice("docs/".length)}`;
}