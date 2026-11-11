import type { DocsLanguage } from "./docs-hub-translations";

/** Explicit allowlist: fall back to original English references when a translation is absent. */
export const TRANSLATED_DOCS_ARTICLES = [
  "docs/README.md",
  "docs/operations/self-hosted-preflight-checklist.md",
] as const;
const translatedPaths: ReadonlySet<string> = new Set(TRANSLATED_DOCS_ARTICLES);

export function resolveDocsArticlePath(path: string, language: DocsLanguage): string {
  if (language === "en" || !translatedPaths.has(path)) return path;
  return `docs/translations/${language}/${path.slice("docs/".length)}`;
}
