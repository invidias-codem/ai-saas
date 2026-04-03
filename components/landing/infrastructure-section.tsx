"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ServerIcon, LayersIcon, RocketIcon, LockClosedIcon } from "@radix-ui/react-icons";

const infraCards = [
  {
    key: "card1",
    icon: ServerIcon,
    color: "text-violet-600 dark:text-violet-300",
    border: "border-violet-300/50 dark:border-violet-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(139,92,246,0.35)]",
  },
  {
    key: "card2",
    icon: LayersIcon,
    color: "text-sky-600 dark:text-sky-300",
    border: "border-sky-300/50 dark:border-sky-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(56,189,248,0.35)]",
  },
  {
    key: "card3",
    icon: RocketIcon,
    color: "text-amber-600 dark:text-amber-300",
    border: "border-amber-300/50 dark:border-amber-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(245,158,11,0.35)]",
  },
  {
    key: "card4",
    icon: LockClosedIcon,
    color: "text-emerald-600 dark:text-emerald-300",
    border: "border-emerald-300/50 dark:border-emerald-500/30",
    glow: "shadow-[0_0_24px_-10px_rgba(16,185,129,0.35)]",
  },
];

export const InfrastructureSection = () => {
  const t = useTranslations("Landing.infrastructure");

  return (
    <section className="relative py-16 md:py-32 px-4 bg-slate-100 dark:bg-[#090d16] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,92,246,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.35) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[420px] bg-violet-400/10 dark:bg-violet-700/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[420px] h-[420px] bg-sky-400/10 dark:bg-sky-700/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium text-violet-700 dark:text-violet-300 border border-violet-300/50 dark:border-violet-500/30 bg-violet-100/80 dark:bg-violet-500/10 mb-6">
            {t("eyebrow")}
          </span>
          <h2
            className="font-bold tracking-tight text-slate-900 dark:text-white mb-6 font-heading"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("title")}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {infraCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`relative rounded-2xl overflow-hidden border ${card.border} ${card.glow} bg-white/75 dark:bg-white/[0.04] backdrop-blur-md p-6`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent dark:from-white/[0.04] dark:to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className={`w-11 h-11 rounded-xl mb-5 flex items-center justify-center bg-white/70 dark:bg-white/5 ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3 font-heading">
                    {t(`${card.key}Title`)}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
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
