"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export const Governance = () => {
  const t = useTranslations("Landing.expertV2.trust");

  const bullets = [
    { key: "workspace", icon: "🛡️" },
    { key: "integrations", icon: "🔌" },
    { key: "providers", icon: "🧠" },
    { key: "visibility", icon: "📊" },
  ] as const;

  return (
    <section className="relative">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left: Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-5"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4 block">
              {t("eyebrow")}
            </span>
            <h2 className="font-heading font-bold tracking-tight text-3xl md:text-4xl">
              {t("title")}
            </h2>
          </motion.div>

          {/* Right: Governance bullets */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {bullets.map((bullet, i) => (
                <motion.div
                  key={bullet.key}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="relative rounded-xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  <div className="relative z-10">
                    <div className="text-2xl mb-3">{bullet.icon}</div>
                    <p className="text-sm text-white/70 leading-relaxed">
                      {t(bullet.key)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
