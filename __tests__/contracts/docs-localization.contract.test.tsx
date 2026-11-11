import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Documentation Hub — Language Preview (Slice 1)', () => {
  const supportedLocales = ['en', 'es', 'fr', 'de', 'th', 'vi'] as const;
  type Locale = (typeof supportedLocales)[number];

  it('i18n.ts exports all six locales and uses dynamic locale', () => {
    const i18n = source('i18n.ts');
    expect(i18n).toContain("locales = ['en', 'es', 'fr', 'de', 'th', 'vi']");
    expect(i18n).toContain('async ({ locale })');
    expect(i18n).toContain('const safeLocale = locale || defaultLocale');
    expect(i18n).toContain('locale: safeLocale');
    expect(i18n).toContain('messages: (await import(`./messages/${safeLocale}.json`)).default');
  });

  it('each locale file contains the Docs namespace', () => {
    supportedLocales.forEach((locale) => {
      const messages = JSON.parse(source(`messages/${locale}.json`));
      expect(messages.Docs).toBeDefined();
      expect(messages.Docs.hero).toBeDefined();
      expect(messages.Docs.features).toBeDefined();
      expect(messages.Docs.newUser).toBeDefined();
      expect(messages.Docs.howToUse).toBeDefined();
      expect(messages.Docs.recipes).toBeDefined();
      expect(messages.Docs.sections).toBeDefined();
      expect(messages.Docs.sidebar).toBeDefined();
      expect(messages.Docs.usefulFor).toBeDefined();
      expect(messages.Docs.cta).toBeDefined();
      expect(messages.Docs.nav).toBeDefined();
      expect(messages.Docs.languageSelector).toBeDefined();
    });
  });

  it('language selector has correct locale labels in all languages', () => {
    supportedLocales.forEach((locale) => {
      const messages = JSON.parse(source(`messages/${locale}.json`));
      const selector = messages.Docs.languageSelector;
      expect(selector.label).toBeTruthy();
      expect(selector.selectLanguage).toBeTruthy();
      supportedLocales.forEach((lang) => {
        expect(selector[lang]).toBeTruthy();
      });
    });
  });

  it('usefulFor has individual item keys in all languages', () => {
    supportedLocales.forEach((locale) => {
      const messages = JSON.parse(source(`messages/${locale}.json`));
      const usefulFor = messages.Docs.usefulFor;
      expect(usefulFor.label).toBeTruthy();
      expect(usefulFor.item1).toBeTruthy();
      expect(usefulFor.item2).toBeTruthy();
      expect(usefulFor.item3).toBeTruthy();
      expect(usefulFor.item4).toBeTruthy();
      expect(usefulFor.item5).toBeTruthy();
    });
  });

  it('docs page uses useTranslations and imports LanguageSelector', () => {
    const docsPage = source('app/[locale]/(landing)/docs/page.tsx');
    expect(docsPage).toContain('"use client"');
    expect(docsPage).toContain('import { useTranslations } from "next-intl"');
    expect(docsPage).toContain('useTranslations("Docs")');
    expect(docsPage).toContain('import { LanguageSelector } from "@/components/docs/LanguageSelector"');
    expect(docsPage).toContain('<LanguageSelector />');
  });

  it('docs page does not contain hardcoded English strings for translated sections', () => {
    const docsPage = source('app/[locale]/(landing)/docs/page.tsx');
    // These should now be translation calls
    expect(docsPage).not.toContain('Documentation Hub');
    expect(docsPage).not.toContain('Docs for onboarding, operating, and extending');
    expect(docsPage).not.toContain('New user path');
    expect(docsPage).not.toContain('How to use this docs set');
    expect(docsPage).not.toContain('Power-user recipes');
    expect(docsPage).not.toContain('Need a path that is not documented yet?');
  });

  it('all six locale files exist', () => {
    supportedLocales.forEach((locale) => {
      expect(existsSync(join(process.cwd(), `messages/${locale}.json`))).toBe(true);
    });
  });

  it('LanguageSelector component exists and handles lang param correctly', () => {
    const selector = source('components/docs/LanguageSelector.tsx');
    expect(selector).toContain('"use client"');
    expect(selector).toContain('const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "th", "vi"] as const');
    expect(selector).toContain('searchParams.get("lang")');
    expect(selector).toContain('params.delete("lang")');
    expect(selector).toContain('params.set("lang", lang)');
    expect(selector).toContain('window.location.href');
    expect(selector).toContain('<Suspense');
    expect(selector).toContain('LanguageSelectorInner');
  });

  it('invalid lang param falls back to English', () => {
    const selector = source('components/docs/LanguageSelector.tsx');
    expect(selector).toContain('|| "en"');
  });

  it('commands and technical paths remain untranslated', () => {
    const enMessages = JSON.parse(source('messages/en.json'));
    // Check that commands in newUser steps are present (they should not be translated)
    expect(enMessages.Docs.newUser.step2.command).toContain('lattice --version');
    expect(enMessages.Docs.newUser.step2.command).toContain('lattice doctor');
    expect(enMessages.Docs.newUser.step3.command).toContain('lattice license activate');
    expect(enMessages.Docs.newUser.step4.command).toContain('lattice deploy start');
    expect(enMessages.Docs.newUser.step4.command).toContain('lattice health check');
  });

  it('section structure matches expected doc sections', () => {
    const enMessages = JSON.parse(source('messages/en.json'));
    const sections = enMessages.Docs.sections;
    expect(sections.overview).toBeDefined();
    expect(sections.onboarding).toBeDefined();
    expect(sections.cliAppliance).toBeDefined();
    expect(sections.architecture).toBeDefined();
    expect(sections.security).toBeDefined();
    expect(sections.operations).toBeDefined();
    expect(sections.reference).toBeDefined();
    expect(sections.decisions).toBeDefined();
  });
});