/**
 * Documentation-only translations sourced from the six existing Docs message namespaces.
 * This does not enable app-wide i18n. Commands and technical identifiers remain in English.
 */
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import de from "../messages/de.json";
import th from "../messages/th.json";
import vi from "../messages/vi.json";

export const DOCS_LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "th", label: "ไทย" },
  { code: "vi", label: "Tiếng Việt" }
] as const;

export type DocsLanguage = (typeof DOCS_LANGUAGE_OPTIONS)[number]["code"];
const dictionaries: Record<DocsLanguage, unknown> = { en: en.Docs, es: es.Docs, fr: fr.Docs, de: de.Docs, th: th.Docs, vi: vi.Docs };

export function resolveDocsLanguage(value: unknown): DocsLanguage {
  if (typeof value !== "string") return "en";
  return DOCS_LANGUAGE_OPTIONS.find(({ code }) => code === value)?.code ?? "en";
}

function lookup(locale: DocsLanguage, key: string): string | undefined {
  let node: unknown = dictionaries[locale];
  for (const segment of key.split(".")) {
    if (node == null || typeof node !== "object" || !Object.prototype.hasOwnProperty.call(node, segment)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "string" ? node : undefined;
}

export function translateDocsText(locale: DocsLanguage, key: string): string {
  if (key.endsWith(".command")) return lookup("en", key) ?? key;
  return lookup(locale, key) ?? lookup("en", key) ?? key;
}
