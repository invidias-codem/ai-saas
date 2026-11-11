import { DOCS_LANGUAGE_OPTIONS, translateDocsText, type DocsLanguage } from "@/lib/docs-hub-translations";

/** Server-rendered, accessible GET form; keeps documentation language separate from app routing. */
export function LanguageSelector({ language }: { language: DocsLanguage }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <form method="get" action="/en/docs" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-40 flex-col gap-2">
          <label htmlFor="docs-language" className="text-sm font-semibold">
            {translateDocsText(language, "languageSelector.label")}
          </label>
          <select name="lang" id="docs-language" defaultValue={language}
            className="min-h-11 min-w-40 rounded-lg border border-border bg-background px-3 text-sm text-foreground">
            {DOCS_LANGUAGE_OPTIONS.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          {translateDocsText(language, "languageSelector.selectLanguage")}
        </button>
      </form>
      {language !== "en" && (
        <p lang="en" className="mt-3 text-xs leading-5 text-muted-foreground">
          Translation preview: linked technical articles and terminal commands remain in English.
        </p>
      )}
    </div>
  );
}
