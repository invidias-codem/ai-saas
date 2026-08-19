"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export const UseCases = () => {
  const t = useTranslations("Landing.expertV2.useCases");

  const cards = [
    {
      id: "engineering",
      icon: "🧑‍💻",
    },
    {
      id: "services",
      icon: "📋",
    },
    {
      id: "operations",
      icon: "⚡",
    },
  ] as const;

  return (
    <section className="relative border-t border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
        {/* Three-column card grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300"
            >
              {/* Hover gradient overlay */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative z-10">
                <div className="text-4xl mb-5">{card.icon}</div>
                <h3 className="text-xl font-bold mb-3 font-heading">
                  {t(`${card.id}.title`)}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed mb-6">
                  {t(`${card.id}.body`)}
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
                >
                  {t(`${card.id}.cta`)}
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
