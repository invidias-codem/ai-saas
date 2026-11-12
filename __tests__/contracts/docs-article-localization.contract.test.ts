import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDocsArticlePath, TRANSLATED_DOCS_ARTICLES } from "../../lib/docs-article-localization";
import { DOCS_LANGUAGE_OPTIONS } from "../../lib/docs-hub-translations";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const languages = DOCS_LANGUAGE_OPTIONS.map((x) => x.code);
const sources = [
  "docs/README.md",
  "docs/operations/self-hosted-preflight-checklist.md",
  "scripts/lattice-cli/README.md",
  "docs/operations/device-aware-install.md",
] as const;

function fencedBlocks(markdown: string): string[] {
  return markdown.match(/^\x60\x60\x60[^\n]*\n[\s\S]*?^\x60\x60\x60/gm) ?? [];
}
function identifiers(markdown: string): string[] {
  const prose = markdown.replace(/^\x60\x60\x60[^\n]*\n[\s\S]*?^\x60\x60\x60/gm, "");
  return [...prose.matchAll(/\x60([^\x60\n]+)\x60/g)].map((m) => m[1]).sort();
}
function markdownTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).sort();
}
const expectedArticlePath = (original: string, language: string): string => {
  if (language === "en") return original;
  if (original === "scripts/lattice-cli/README.md" || original === "docs/operations/device-aware-install.md") {
    return original.replace(/\.md$/, "." + language + ".md");
  }
  return original.replace(/^docs\//, "docs/translations/" + language + "/");
};
function count(markdown: string, pattern: RegExp): number {
  return (markdown.match(pattern) || []).length;
}

describe("translated documentation articles — Slices 2 and 3", () => {
  it("only publishes explicitly mapped English reference articles", () => {
    expect(TRANSLATED_DOCS_ARTICLES).toEqual(sources);
    for (const p of sources) expect(read(p).length).toBeGreaterThan(700);
  });

  it("links available translations while falling back for other technical documents", () => {
    for (const language of languages) {
      for (const original of sources) {
        const expected = expectedArticlePath(original, language);
        expect(resolveDocsArticlePath(original, language)).toBe(expected);
        expect(read(expected)).toBeTruthy();
      }
      expect(resolveDocsArticlePath("docs/reference/api-reference.md", language))
        .toBe("docs/reference/api-reference.md");
      expect(resolveDocsArticlePath("docs/operations/deployment-modes.md", language))
        .toBe("docs/operations/deployment-modes.md");
      expect(resolveDocsArticlePath("/beta/start", language)).toBe("/beta/start");
      expect(resolveDocsArticlePath("docs/../secrets.txt", language)).toBe("docs/../secrets.txt");
    }
  });

  it("preserves all inline code, identifiers and paths from English originals", () => {
    for (const original of sources) {
      const tokens = identifiers(read(original));
      for (const language of languages.filter((l) => l !== "en")) {
        const translated = read(resolveDocsArticlePath(original, language));
        expect(identifiers(translated)).toEqual(tokens);
        expect(fencedBlocks(translated)).toEqual(fencedBlocks(read(original)));
        expect(markdownTargets(translated)).toEqual(markdownTargets(read(original)));
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
    expect(page).toContain('sections.operations.items.deviceInstallation.title');
    expect(page).toContain('path: "docs/operations/device-aware-install.md"');
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
      expect(data.Docs.sections.operations.items.deviceInstallation.title.length).toBeGreaterThan(3);
    }
  });

  it("keeps CLI release-candidate and device safety boundaries explicit", () => {
    const cliSource = read("scripts/lattice-cli/README.md");
    const deviceSource = read("docs/operations/device-aware-install.md");
    for (const language of languages.filter((l) => l !== "en")) {
      const cli = read(resolveDocsArticlePath("scripts/lattice-cli/README.md", language));
      const device = read(resolveDocsArticlePath("docs/operations/device-aware-install.md", language));
      expect(cli).toContain("0.3.1-rc.1");
      expect(cli).toContain("../../docs/releases/cli-release-readiness.md");
      expect(cli).toContain("gh attestation verify lattice-linux-amd64");
      expect(cli).toContain("lattice doctor --offline --json");
      expect(cli).toContain("cli-v0.3.1-rc.1");
      expect(device).toContain("beforeinstallprompt");
      expect(device).toContain("appinstalled");
      expect(device).toContain("../evidence/install-chooser-windows-2026-10-31.jpg");
      expect(device).toContain("https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27");
      expect(fencedBlocks(cli)).toEqual(fencedBlocks(cliSource));
      expect(markdownTargets(device)).toEqual(markdownTargets(deviceSource));
    }
  });
});
