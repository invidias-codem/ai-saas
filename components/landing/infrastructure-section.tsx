"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { LayersIcon, RocketIcon, LockClosedIcon, CubeIcon } from "@radix-ui/react-icons";

const infraCards = [
  {
    key: "card1",
    icon: CubeIcon,
    color: "text-amber-700 dark:text-violet-300",
    border: "border-amber-200/70 dark:border-violet-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(245,158,11,0.22)] dark:shadow-[0_0_24px_-10px_rgba(139,92,246,0.35)]",
  },
  {
    key: "card2",
    icon: LayersIcon,
    color: "text-violet-700 dark:text-sky-300",
    border: "border-violet-200/70 dark:border-sky-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(139,92,246,0.18)] dark:shadow-[0_0_24px_-10px_rgba(56,189,248,0.35)]",
  },
  {
    key: "card3",
    icon: RocketIcon,
    color: "text-orange-700 dark:text-amber-300",
    border: "border-orange-200/70 dark:border-amber-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(249,115,22,0.22)] dark:shadow-[0_0_24px_-10px_rgba(245,158,11,0.35)]",
  },
  {
    key: "card4",
    icon: LockClosedIcon,
    color: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/70 dark:border-emerald-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(16,185,129,0.22)] dark:shadow-[0_0_24px_-10px_rgba(16,185,129,0.35)]",
  },
];

export const InfrastructureSection = () => {
  const t = useTranslations("Landing.infrastructure");

  return (
    <section className="landing-bg-muted relative overflow-hidden px-4 py-16 md:py-32">
      <div
        className="landing-grid-overlay absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.03]"
        style={{ backgroundSize: "44px 44px" }}
      />

      <div className="landing-orb-primary absolute top-0 left-1/2 h-[420px] w-[900px] -translate-x-1/2 rounded-full blur-[60px] dark:blur-[120px] opacity-20 dark:opacity-100 pointer-events-none" />
      <div className="landing-orb-secondary absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full blur-[60px] dark:blur-[120px] opacity-20 dark:opacity-100 pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <span className="landing-badge-primary mb-6 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t("eyebrow")}
          </span>
          <h2
            className="landing-text-primary mb-6 font-heading font-bold tracking-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("title")}
          </h2>
          <p className="landing-text-secondary mx-auto max-w-3xl text-lg leading-relaxed md:text-xl">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {infraCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`landing-card-strong relative overflow-hidden rounded-2xl border ${card.border} ${card.glow} p-6`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent dark:from-white/[0.04] dark:to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 dark:bg-white/5 ${card.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="landing-text-primary mb-3 text-xl font-heading font-bold">
                    {t(`${card.key}Title`)}
                  </h3>
                  <p className="landing-text-secondary text-sm leading-relaxed">
                    {t(`${card.key}Body`)}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
