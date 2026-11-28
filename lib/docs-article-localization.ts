import type { DocsLanguage } from "./docs-hub-translations";

/** Explicit allowlist: fall back to original English references when a translation is absent. */
export const TRANSLATED_DOCS_ARTICLES = [
  "docs/README.md",
  "docs/operations/self-hosted-preflight-checklist.md",
  "scripts/lattice-cli/README.md",
  "docs/operations/device-aware-install.md",
] as const;
const translatedPaths: ReadonlySet<string> = new Set(TRANSLATED_DOCS_ARTICLES);

export function resolveDocsArticlePath(path: string, language: DocsLanguage): string {
  if (language === "en" || !translatedPaths.has(path)) return path;
  // These two guides live beside their English originals so their relative
  // Markdown links (release readiness / evidence screenshots) remain valid.
  if (path === "scripts/lattice-cli/README.md" || path === "docs/operations/device-aware-install.md") {
    return path.replace(/\.md$/, `.${language}.md`);
  }
  return `docs/translations/${language}/${path.slice("docs/".length)}`;
}
