"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  ActivityIcon,
  DatabaseIcon,
  TerminalIcon,
  LockIcon,
  ServerIcon,
  CpuIcon,
  FileCheckIcon,
  ScaleIcon,
  GlobeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: DatabaseIcon, key: "conversation" },
  { icon: TerminalIcon, key: "code" },
  { icon: FileCheckIcon, key: "research" },
  { icon: ActivityIcon, key: "hybrid" },
  { icon: LockIcon, key: "memoryLayer" },
  { icon: ServerIcon, key: "infrastructure" },
] as const;

const COMPLIANCE = [
  { icon: GlobeIcon, key: "gdpr" },
  { icon: ShieldCheckIcon, key: "hipaa" },
  { icon: ScaleIcon, key: "dora" },
  { icon: LockIcon, key: "soc2" },
] as const;

const INFRA_CARDS = [
  { icon: TerminalIcon, key: "card1" },
  { icon: ShieldCheckIcon, key: "card2" },
  { icon: CpuIcon, key: "card3" },
  { icon: FileCheckIcon, key: "card4" },
] as const;

export default function SovereignLandingPage() {
  const t = useTranslations("Landing");

  return (
    <main>
      <section className="mx-auto max-w-7xl px-6 pb-14 pt-10 sm:pt-16 md:pb-20">
        <div className="max-w-4xl">
          <span className="inline-block rounded-full border border-border bg-accent px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-foreground mb-8">
            {t("hero.badge")}
          </span>

          <h1 className="mb-6 wrap-anywhere font-heading font-bold leading-[1.05] tracking-tight" style={{ fontSize: "clamp(2.8rem, 7vw, 5.5rem)" }}>
            {t("hero.headline1")}
            <br />
            <span className="text-muted-foreground">{t("hero.headline2")}</span>
            <br />
            <span className="text-muted-foreground">{t("hero.headline3")}</span>
          </h1>

          <p className="text-muted-foreground text-lg md:text-xl leading-relaxed max-w-2xl mb-10">
            {t("hero.subhead")}
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild variant="action" size="lg" className="rounded-full px-8 py-6 text-base font-semibold min-h-12 whitespace-normal text-center">
              <Link href="/onboarding">
                {t("hero.cta")}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-h-12 rounded-full px-6 py-6 text-base whitespace-normal text-center">
              <Link href="#infrastructure">
                {t("hero.ctaSecondary")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          UCOL — Proportional Intelligence
          ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border bg-chrome">
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
          <div className="mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 block">
              {t("ucol.eyebrow")}
            </span>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
              {t("ucol.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl">
              {t("ucol.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { titleKey: "card1Title", bodyKey: "card1Body" },
              { titleKey: "card2Title", bodyKey: "card2Body" },
              { titleKey: "card3Title", bodyKey: "card3Body" },
              { titleKey: "card4Title", bodyKey: "card4Body" },
            ].map((card, i) => (
              <div
                key={card.titleKey}
                className="group relative rounded-2xl border border-border bg-card p-5 sm:p-8 hover:border-input hover:bg-chrome transition duration-200"
              >

                <div className="relative z-10">
                  <h3 className="text-lg font-semibold mb-2 font-heading">{t(`ucol.${card.titleKey}`)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{t(`ucol.${card.bodyKey}`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          MEMORY — Persistent Knowledge Graph
          ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
          <div className="mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 block">
              {t("memory.eyebrow")}
            </span>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
              {t("memory.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl">
              {t("memory.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { valueKey: "stat1Value", labelKey: "stat1Label" },
              { valueKey: "stat2Value", labelKey: "stat2Label" },
              { valueKey: "stat3Value", labelKey: "stat3Label" },
            ].map((stat, i) => (
              <div
                key={stat.valueKey}
                className="text-center"
              >
                <div className="text-4xl md:text-5xl font-bold font-heading mb-2">{t(`memory.${stat.valueKey}`)}</div>
                <div className="text-muted-foreground text-sm">{t(`memory.${stat.labelKey}`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FEATURES
          ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border bg-chrome">
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
          <div className="mb-16">
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
              {t("features.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.key}
                className="group relative rounded-2xl border border-border bg-card p-5 sm:p-8 hover:border-input hover:bg-chrome transition duration-200"
              >

                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg border border-border bg-accent flex items-center justify-center mb-5">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 font-heading">{t(`features.${feature.key}`)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{t(`features.${feature.key}Desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          COMPLIANCE
          ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
          <div className="mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 block">
              {t("compliance.eyebrow")}
            </span>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
              {t("compliance.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl">
              {t("compliance.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {COMPLIANCE.map((item, i) => (
              <div
                key={item.key}
                className="group relative rounded-2xl border border-border bg-card p-5 sm:p-8 hover:border-input hover:bg-chrome transition duration-200"
              >

                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg border border-border bg-accent flex items-center justify-center mb-5">
                    <item.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 font-heading">{t(`compliance.${item.key}Title`)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{t(`compliance.${item.key}Body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          INFRASTRUCTURE
          ═══════════════════════════════════════════════════════════════ */}
      <section id="infrastructure" className="scroll-mt-16 border-t border-border bg-chrome">
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
          <div className="mb-16">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 block">
              {t("infrastructure.eyebrow")}
            </span>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
              {t("infrastructure.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-3xl">
              {t("infrastructure.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {INFRA_CARDS.map((card, i) => (
              <div
                key={card.key}
                className="group relative rounded-2xl border border-border bg-card p-5 sm:p-8 hover:border-input hover:bg-chrome transition duration-200"
              >

                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg border border-border bg-accent flex items-center justify-center mb-5">
                    <card.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 font-heading">{t(`infrastructure.${card.key}Title`)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{t(`infrastructure.${card.key}Body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          CTA
          ═══════════════════════════════════════════════════════════════ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-28 text-center">
          <div>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-6">
              {t("cta.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-10">
              {t("cta.subtitle")}
            </p>
            <div className="flex flex-col items-center gap-5">
              <Button asChild variant="action" size="lg" className="min-h-12 rounded-full px-6 py-6 text-lg font-semibold whitespace-normal text-center sm:px-10">
                <Link href="/onboarding">
                  {t("cta.button")}
                  <ArrowRightIcon className="ml-2 h-5 w-5 shrink-0" />
                </Link>
              </Button>
              <Link
                href="/expert"
                className="inline-flex min-h-12 items-center text-sm text-muted-foreground transition hover:text-primary"
              >
                Self-hosting too much? Hire a Lattice expert instead →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
