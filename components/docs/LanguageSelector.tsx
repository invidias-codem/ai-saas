import { DOCS_LANGUAGE_OPTIONS, translateDocsText, type DocsLanguage } from "@/lib/docs-hub-translations";

/** Server-rendered, accessible GET form; keeps documentation language separate from app routing. */
export function LanguageSelector({
  language, selectId = "docs-language",
}: { language: DocsLanguage; selectId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <form method="get" action="/en/docs" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label htmlFor={selectId} className="text-sm font-semibold">
            {translateDocsText(language, "languageSelector.label")}
          </label>
          <select name="lang" id={selectId} defaultValue={language}
            className="min-h-11 w-full min-w-32 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
            {DOCS_LANGUAGE_OPTIONS.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-lg border border-input bg-chrome px-4 text-sm font-semibold text-foreground hover:bg-accent hover:text-accent-foreground">
          {translateDocsText(language, "languageSelector.selectLanguage")}
        </button>
      </form>
      {language !== "en" && (
        <p lang={language} className="mt-3 text-xs leading-5 text-muted-foreground">
          {translateDocsText(language, "languageSelector.previewNotice")}
        </p>
      )}
    </div>
  );
}
