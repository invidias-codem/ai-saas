"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Link from "next/link";
import { CheckIcon, RocketIcon, StarFilledIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { CheckoutModal } from "@/components/checkout-modal";

const PLANS = [
  {
    nameKey: "freeTierName",
    price: "Free",
    unitKey: "freeTierUnit",
    descKey: "freeTierSubtitle",
    features: ["freeTierFeature1", "freeTierFeature2", "freeTierFeature3"],
    popular: false,
    href: "/sign-up",
    cta: "Get started",
  },
  {
    nameKey: "creatorBundle",
    price: "$5",
    unitKey: "creatorBundleUnit",
    descKey: "subtitle",
    features: ["creatorBundleFeature1", "creatorBundleFeature2", "creatorBundleFeature3"],
    popular: true,
    href: "#checkout",
    cta: "Start with Starter",
  },
  {
    nameKey: "proStudio",
    price: "$20",
    unitKey: "proStudioUnit",
    descKey: "subtitle",
    features: ["proStudioFeature1", "proStudioFeature2", "proStudioFeature3"],
    popular: false,
    href: "#checkout",
    cta: "Start with Pro",
  },
  {
    nameKey: "enterprise",
    price: "Talk to sales",
    unitKey: "enterpriseUnit",
    descKey: "enterpriseSubtitle",
    features: ["enterpriseFeature1", "enterpriseFeature2", "enterpriseFeature3"],
    popular: false,
    href: "/support",
    cta: "Contact sales",
  },
];

export default function PricingPage() {
  const t = useTranslations("Landing");

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,0.08),transparent_60%)] pointer-events-none" />

      <div className="relative z-10">
        <header className="border-b border-border/60 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-600" />
              <span className="text-lg font-bold tracking-tight font-heading">Lattice OS</span>
            </Link>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
              <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
            </nav>
            <Link href="/sign-up">
              <Button className="rounded-full px-6 py-2 text-sm font-semibold">
                {t("pricing.startCreating")}
              </Button>
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl mx-auto text-center mb-16"
          >
            <span className="inline-block rounded-full border border-purple-500/30 bg-purple-500/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-purple-300 mb-8">
              Pricing
            </span>
            <h1 className="font-heading font-bold tracking-tight leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.6rem, 6vw, 4.6rem)' }}>
              {t("pricing.title")}
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
              {t("pricing.subtitle")}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan, idx) => (
              <motion.div
                key={plan.nameKey}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  plan.popular
                    ? "border-purple-500 bg-gradient-to-br from-purple-500/5 to-pink-500/5 shadow-[0_0_35px_-8px_rgba(168,85,247,0.35)]"
                    : "border-border bg-card"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold">
                    Free tier glow
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-lg font-bold text-foreground mb-2">{t(`pricing.${plan.nameKey}`)}</h3>
                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">{t(`pricing.${plan.unitKey}`)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{t(`pricing.${plan.descKey}`)}</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckIcon className="w-4 h-4 text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                      <span>{t(`pricing.${feature}`)}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full rounded-xl font-semibold ${
                    plan.popular
                      ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:opacity-90"
                      : ""
                  }`}
                  onClick={() => {
                    if (plan.href.startsWith("#")) {
                      const el = document.getElementById("checkout");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                >
                  {plan.cta}
                </Button>
              </motion.div>
            ))}
          </div>

          <div id="checkout" className="mt-24">
            <CheckoutModal open={false} onOpenChange={() => {}} />
          </div>

          <p className="text-xs text-center text-muted-foreground mt-12">
            {t("pricing.disclaimer")}
          </p>
        </section>

        <footer className="border-t border-border py-8">
          <div className="mx-auto max-w-7xl px-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} Lattice OS. All rights reserved.</span>
            <span>Expert as a Service</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
