import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDocsArticlePath, TRANSLATED_DOCS_ARTICLES } from "../../lib/docs-article-localization";
import { DOCS_LANGUAGE_OPTIONS } from "../../lib/docs-hub-translations";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const languages = DOCS_LANGUAGE_OPTIONS.map((x) => x.code);
const sources = [
  "docs/README.md",
  "docs/operations/self-hosted-preflight-checklist.md",
] as const;

function identifiers(markdown: string): string[] {
  return [...markdown.matchAll(/[\x60]([^\x60]+)[\x60]/g)].map((match) => match[1]).sort();
}
function count(markdown: string, pattern: RegExp): number {
  return (markdown.match(pattern) || []).length;
}

describe("translated documentation articles — Slice 2", () => {
  it("only publishes the two mapped English reference articles", () => {
    expect(TRANSLATED_DOCS_ARTICLES).toEqual(sources);
    for (const p of sources) expect(read(p).length).toBeGreaterThan(700);
  });

  it("links available translations while falling back for other technical documents", () => {
    for (const language of languages) {
      for (const original of sources) {
        const expected = language === "en"
          ? original
          : original.replace(/^docs\//, "docs/translations/" + language + "/");
        expect(resolveDocsArticlePath(original, language)).toBe(expected);
        expect(read(expected)).toBeTruthy();
      }
      expect(resolveDocsArticlePath("docs/reference/api-reference.md", language))
        .toBe("docs/reference/api-reference.md");
      expect(resolveDocsArticlePath("scripts/lattice-cli/README.md", language))
        .toBe("scripts/lattice-cli/README.md");
      expect(resolveDocsArticlePath("/beta/start", language)).toBe("/beta/start");
      expect(resolveDocsArticlePath("docs/../secrets.txt", language)).toBe("docs/../secrets.txt");
    }
  });

  it("preserves all inline code, identifiers and paths from English originals", () => {
    for (const original of sources) {
      const tokens = identifiers(read(original));
      for (const language of languages.filter((l) => l !== "en")) {
        expect(identifiers(read(resolveDocsArticlePath(original, language)))).toEqual(tokens);
      }
    }
  });

  it("preserves Markdown headings, checkboxes and numbered steps", () => {
    const formats = [/^#{1,4} /gm, /^- \[ \] /gm, /^[1-9]\. /gm, /^---$/gm];
    for (const original of sources) {
      for (const language of languages.filter((l) => l !== "en")) {
        const article = read(resolveDocsArticlePath(original, language));
        for (const pattern of formats) {
          expect(count(article, pattern)).toBe(count(read(original), pattern));
        }
      }
    }
    const preflight = read("docs/operations/self-hosted-preflight-checklist.md");
    expect(count(preflight, /^- \[ \] /gm)).toBe(44);
    expect(count(preflight, /^[1-9]\. /gm)).toBe(9);
  });

  it("includes genuine translated articles without losing line structure", () => {
    for (const original of sources) {
      for (const language of languages.filter((l) => l !== "en")) {
        const article = read(resolveDocsArticlePath(original, language));
        expect(article).not.toBe(read(original));
        expect(article.split("\n").length).toBe(read(original).split("\n").length);
      }
    }
  });

  it("links translations from the hub and shows an accessible mobile language picker", () => {
    const page = read("app/[locale]/(landing)/docs/page.tsx");
    const selector = read("components/docs/LanguageSelector.tsx");
    expect(page).toContain("resolveDocsArticlePath(path, language)");
    expect(page).toContain('process.env.VERCEL_ENV === "preview"');
    expect(page).toContain("process.env.VERCEL_GIT_COMMIT_SHA");
    expect(page).toContain("GITHUB_ARTICLE_REF");
    expect(page).toContain('blob/${GITHUB_ARTICLE_REF}');
    expect(page).toContain("githubUrlForPath(item.path, language)");
    expect(page).toContain("githubUrlForPath(link, language)");
    expect(page).toContain('selectId="docs-language-mobile"');
    expect(page).toContain('selectId="docs-language-desktop"');
    expect(selector).toContain("htmlFor={selectId}");
    expect(selector).toContain("id={selectId}");
    expect(selector).toContain("languageSelector.previewNotice");
    expect(page).toContain('<code lang="en">{item.command}</code>');
    expect(read("i18n.ts")).toContain("export const locales = ['en'] as const");
  });

  it("explains partial article coverage in all six existing catalogs", () => {
    for (const language of languages) {
      const data = JSON.parse(read("messages/" + language + ".json"));
      expect(data.Docs.languageSelector.previewNotice.length).toBeGreaterThan(50);
    }
  });
});
