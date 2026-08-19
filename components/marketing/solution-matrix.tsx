"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

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
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4 block">
            {t("eyebrow")}
          </span>
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
            {t("title")}
          </h2>
        </motion.div>

        {/* Outcome-to-Delivery Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rows.map((row, i) => (
            <motion.div
              key={row.outcomeKey}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-8"
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative z-10">
                <h3 className="text-lg font-semibold mb-3 font-heading">
                  {t(row.outcomeKey)}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
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
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-10"
        >
          <Link
            href="/docs"
            className="text-sm font-semibold text-white/80 hover:text-white transition-colors underline underline-offset-4"
          >
            Explore the platform
          </Link>
        </motion.div>
      </div>
    </section>
  );
};
