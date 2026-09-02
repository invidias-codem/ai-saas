"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay: i * 0.08,
      ease: EASE_OUT,
    },
  }),
};

export const SolutionMatrix = () => {
  const t = useTranslations("Landing.expertV2.solution");

  const rows = [
    { outcomeKey: "outcome1", deliveryKey: "delivery1" },
    { outcomeKey: "outcome2", deliveryKey: "delivery2" },
    { outcomeKey: "outcome3", deliveryKey: "delivery3" },
    { outcomeKey: "outcome4", deliveryKey: "delivery4" },
  ] as const;

  return (
    <section className="relative">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-4 block">
            {t("eyebrow")}
          </span>
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4 text-white">
            {t("title")}
          </h2>
        </motion.div>

        {/* Outcome-to-Delivery Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rows.map((row, i) => (
            <motion.div
              key={row.outcomeKey}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-200 hover:bg-white/[0.04]"
            >
              <div className="relative z-10">
                <h3 className="text-lg font-semibold mb-3 font-heading text-white">
                  {t(row.outcomeKey)}
                </h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  {t(row.deliveryKey)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Optional Link */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.4 }}
          className="mt-10"
        >
          <Link
            href="/explore"
            className="text-sm font-semibold text-white/80 hover:text-white min-h-[48px] inline-flex items-center transition underline underline-offset-4"
          >
            Explore the platform
          </Link>
        </motion.div>
      </div>
    </section>
  );
};
