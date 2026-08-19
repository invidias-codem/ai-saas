"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export const ProblemGrid = () => {
  const t = useTranslations("Landing.expertV2.problem");

  const metrics = [
    {
      valueKey: "metric1Value",
      labelKey: "metric1Label",
    },
    {
      valueKey: "metric2Value",
      labelKey: "metric2Label",
    },
    {
      valueKey: "metric3Value",
      labelKey: "metric3Label",
    },
  ] as const;

  return (
    <section className="relative border-t border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4 block">
            {t("eyebrow")}
          </span>
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-6">
            {t("title")}
          </h2>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
            {t("body1")}
          </p>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl mt-4">
            {t("body2")}
          </p>
        </motion.div>

        {/* Metric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.valueKey}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-8"
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative z-10">
                <div className="text-3xl md:text-4xl font-bold font-heading tracking-tight text-white mb-3">
                  {t(metric.valueKey)}
                </div>
                <p className="text-white/60 text-sm leading-relaxed">
                  {t(metric.labelKey)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
