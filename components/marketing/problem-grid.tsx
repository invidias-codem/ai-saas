"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
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
    <section className="relative border-t border-white/5 bg-zinc-900/30">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="max-w-3xl mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-4 block">
            {t("eyebrow")}
          </span>
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-6 text-white">
            {t("title")}
          </h2>
          <p className="text-white/55 text-lg leading-relaxed max-w-2xl">
            {t("body1")}
          </p>
          <p className="text-white/55 text-lg leading-relaxed max-w-2xl mt-4">
            {t("body2")}
          </p>
        </motion.div>

        {/* Metric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.valueKey}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="relative rounded-2xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-200 hover:bg-white/[0.04]"
            >
              <div className="relative z-10">
                <div className="text-3xl md:text-4xl font-bold font-heading tracking-tight text-white mb-3">
                  {t(metric.valueKey)}
                </div>
                <p className="text-white/50 text-sm leading-relaxed">
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
