import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DOCS_LANGUAGE_OPTIONS,
  resolveDocsLanguage,
  translateDocsText,
} from "../../lib/docs-hub-translations";

const page = readFileSync(
  join(process.cwd(), "app/[locale]/(landing)/docs/page.tsx"),
  "utf8",
);

describe("documentation hub language preview", () => {
  const englishHero = "Docs for onboarding, operating, and extending Lattice OS";

  it("offers the existing six message-catalog languages without enabling unfinished app-wide routes", () => {
    expect(DOCS_LANGUAGE_OPTIONS.map(({ code }) => code)).toEqual([
      "en", "es", "fr", "de", "th", "vi",
    ]);
    const globalI18n = readFileSync(join(process.cwd(), "i18n.ts"), "utf8");
    expect(globalI18n).toContain("export const locales = ['en'] as const");
    expect(page).toContain('action="/en/docs"');
    expect(page).toContain('name="lang"');
  });

  it("defaults safely to English for invalid or repeated parameters", () => {
    expect(resolveDocsLanguage(undefined)).toBe("en");
    expect(resolveDocsLanguage("constructor")).toBe("en");
    expect(resolveDocsLanguage("__proto__")).toBe("en");
    expect(resolveDocsLanguage(["es"])).toBe("en");
    expect(resolveDocsLanguage("ES")).toBe("en");
    expect(resolveDocsLanguage("es")).toBe("es");
    expect(resolveDocsLanguage("vi")).toBe("vi");
  });

  it("renders translated hero text in each preview language", () => {
    for (const { code } of DOCS_LANGUAGE_OPTIONS) {
      expect(translateDocsText(code, englishHero)).toBeTruthy();
      if (code !== "en") expect(translateDocsText(code, englishHero)).not.toBe(englishHero);
    }
  });

  it("keeps untranslated technical content and commands in English", () => {
    expect(translateDocsText("es", "lattice doctor --offline --json")).toBe(
      "lattice doctor --offline --json",
    );
    expect(translateDocsText("th", "Untranslated technical phrase")).toBe(
      "Untranslated technical phrase",
    );
    expect(page).toContain("lattice doctor --offline --json");
    expect(page).toContain("lattice license activate <lattice-v3-key>");
    expect(page).toContain("githubUrlForPath(link)");
    expect(page).toContain("Translation preview. Linked technical articles and terminal commands remain in English.");
  });

  it("scopes language to the documentation content and keeps untranslated variants out of search indexing", () => {
    expect(page).toContain("<span lang={language}>{translated}</span>");
    expect(page).not.toContain("<div lang={language}");
    expect(page).toContain('alternates: { canonical: "/en/docs" }');
    expect(page).toContain('robots: { index: language === "en", follow: true }');
    expect(page).toContain("resolveDocsLanguage((await searchParams).lang)");
  });
});
