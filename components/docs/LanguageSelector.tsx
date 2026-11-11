"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

const SUPPORTED_LOCALES = ["en", "es", "fr", "de", "th", "vi"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function LanguageSelectorInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("Docs.languageSelector");

  const currentLang = (searchParams.get("lang") as SupportedLocale) || "en";

  const handleChange = (lang: SupportedLocale) => {
    const params = new URLSearchParams(searchParams.toString());
    if (lang === "en") {
      params.delete("lang");
    } else {
      params.set("lang", lang);
    }
    window.location.href = `${pathname}?${params.toString()}`;
  };

  return (
    <div className="relative">
      <label htmlFor="language-select" className="sr-only">
        {t("label")}
      </label>
      <select
        id="language-select"
        value={currentLang}
        onChange={(e) => handleChange(e.target.value as SupportedLocale)}
        className="appearance-none bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer min-w-[160px]"
        aria-label={t("selectLanguage")}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(locale as "en" | "es" | "fr" | "de" | "th" | "vi")}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LanguageSelector() {
  return (
    <Suspense fallback={<div className="min-w-[160px]" />}>
      <LanguageSelectorInner />
    </Suspense>
  );
}