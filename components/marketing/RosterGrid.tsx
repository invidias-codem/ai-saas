"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { CURATED_PERSONAS, ROSTER_VISIBLE_COUNT } from "@/lib/constants/personas";

export const RosterGrid = () => {
  const t = useTranslations("Landing.expert.cta.roster");
  const [startIndex, setStartIndex] = useState(0);

  const rotate = useCallback(() => {
    setStartIndex((prev) => (prev + ROSTER_VISIBLE_COUNT) % CURATED_PERSONAS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(rotate, 6000);
    return () => clearInterval(timer);
  }, [rotate]);

  const visiblePersonas = CURATED_PERSONAS.slice(startIndex, startIndex + ROSTER_VISIBLE_COUNT);

  // If we're at the end and don't have enough items, wrap around
  const displayPersonas =
    visiblePersonas.length === ROSTER_VISIBLE_COUNT
      ? visiblePersonas
      : [...visiblePersonas, ...CURATED_PERSONAS].slice(0, ROSTER_VISIBLE_COUNT);

  return (
    <section className="border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
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
          <p className="text-white/60 text-lg max-w-2xl">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <AnimatePresence mode="wait">
            {displayPersonas.map((persona, i) => (
              <motion.div
                key={`${startIndex}-${persona.id}-${i}`}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 hover:bg-white/[0.05] transition-all duration-300 flex flex-col"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                <div className="relative z-10 flex-1">
                  <div className="mb-5 text-4xl">{persona.icon}</div>

                  <span className="mb-4 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                    {persona.role}
                  </span>

                  <h3 className="text-xl font-bold mb-3 font-heading">
                    {persona.title}
                  </h3>

                  <p className="text-white/60 text-sm leading-relaxed mb-6">
                    {persona.description}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {persona.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="relative z-10 mt-8">
                  <Link
                    href="/onboarding"
                    className="group/link inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
                  >
                    {t("cta")}
                    <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          {CURATED_PERSONAS.map((_, idx) => {
            const dotIndex = idx % ROSTER_VISIBLE_COUNT;
            const isActive =
              idx >= startIndex && idx < startIndex + ROSTER_VISIBLE_COUNT;
            return (
              <button
                key={idx}
                onClick={() => setStartIndex(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  isActive ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Show personas ${idx + 1}-${idx + ROSTER_VISIBLE_COUNT}`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
};
