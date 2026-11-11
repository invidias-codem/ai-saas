import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_LANGUAGE_OPTIONS, resolveDocsLanguage, translateDocsText } from "../../lib/docs-hub-translations";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const locales = DOCS_LANGUAGE_OPTIONS.map(({ code }) => code);
const page = source("app/[locale]/(landing)/docs/page.tsx");
const sourceKeys = [...new Set([...page.matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1]))];
const lookup = (data: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((current, segment) =>
    current && typeof current === "object"
      ? (current as Record<string, unknown>)[segment]
      : undefined, data);

describe("docs-only six-language preview", () => {
  it("does not expose unfinished app-wide locale routing", () => {
    expect(locales).toEqual(["en", "es", "fr", "de", "th", "vi"]);
    expect(source("i18n.ts")).toContain("export const locales = ['en'] as const");
    expect(page).not.toContain('useTranslations("Docs")');
    expect(page).not.toContain('"use client"');
  });

  it("uses a server-side query language and a progressively enhanced selector", () => {
    expect(page).toContain("resolveDocsLanguage(lang)");
    expect(page).toContain("<LanguageSelector language={language} />");
    const selector = source("components/docs/LanguageSelector.tsx");
    expect(selector).toContain('method="get"');
    expect(selector).toContain('action="/en/docs"');
    expect(selector).toContain('name="lang"');
    expect(selector).toContain('htmlFor="docs-language"');
    expect(selector).not.toContain("window.location.href");
    expect(selector).not.toContain("useSearchParams");
  });

  it("strictly validates language parameters and defaults invalid values to English", () => {
    for (const invalid of [undefined, "", "zz", "ES", "constructor", "__proto__", ["es", "fr"]]) {
      expect(resolveDocsLanguage(invalid)).toBe("en");
    }
    for (const locale of locales) expect(resolveDocsLanguage(locale)).toBe(locale);
  });

  it("has every one of the documentation page keys in all six catalogs", () => {
    expect(sourceKeys.length).toBeGreaterThan(130);
    for (const locale of locales) {
      const catalog = JSON.parse(source("messages/" + locale + ".json")).Docs;
      for (const key of [...sourceKeys, "languageSelector.label", "languageSelector.selectLanguage"]) {
        expect(typeof lookup(catalog, key)).toBe("string");
        expect(translateDocsText(locale, key).length).toBeGreaterThan(0);
      }
    }
  });

  it("renders distinct translated hero copy for all five other languages", () => {
    const original = translateDocsText("en", "hero.title");
    for (const locale of locales) {
      if (locale === "en") continue;
      expect(translateDocsText(locale, "hero.title")).not.toBe(original);
    }
    expect(translateDocsText("es", "missing.nonexistent")).toBe("missing.nonexistent");
  });

  it("always displays English command syntax, regardless of catalog translations", () => {
    const keys = ["newUser.step2.command", "newUser.step3.command", "newUser.step4.command"];
    for (const locale of locales) for (const key of keys) {
      expect(translateDocsText(locale, key)).toBe(translateDocsText("en", key));
    }
    expect(translateDocsText("es", "newUser.step2.command")).toContain("lattice doctor --offline --json");
    expect(page).toContain('<code lang="en">{item.command}</code>');
    expect(page).toContain("githubUrlForPath(link)");
  });

  it("keeps preview URLs nonindexable and canonical to the English documentation hub", () => {
    expect(page).toContain('alternates: { canonical: "/en/docs" }');
    expect(page).toContain("robots: { index: lang === undefined, follow: true }");
    expect(page).toContain("<div lang={language}");
    expect(page).toContain("generateMetadata");
  });
});
