"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { CURATED_PERSONAS, ROSTER_VISIBLE_COUNT } from "@/lib/constants/personas";

export const RosterGrid = () => {
  const t = useTranslations("Landing.expert.cta.roster");
  const [startIndex, setStartIndex] = useState(0);

  const rotate = useCallback(() => {
    setStartIndex((prev) => (prev + 1) % CURATED_PERSONAS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(rotate, 6000);
    return () => clearInterval(timer);
  }, [rotate]);

  const extended = [
    ...CURATED_PERSONAS,
    ...CURATED_PERSONAS,
    ...CURATED_PERSONAS,
  ];

  const offset = CURATED_PERSONAS.length;
  const cardWidth = 100 / ROSTER_VISIBLE_COUNT;

  return (
    <section id="roster" className="border-t border-white/10">
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

        <div className="overflow-hidden">
          <motion.div
            className="flex gap-6"
            animate={{ x: -((offset + startIndex) * cardWidth) + "%" }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          >
            {extended.map((persona, i) => (
              <div
                key={`${persona.id}-${i}`}
                className="flex-shrink-0"
                style={{ width: `${cardWidth}%` }}
              >
                <div className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 hover:bg-white/[0.05] transition-colors duration-300 flex flex-col h-full">
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
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          {CURATED_PERSONAS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setStartIndex(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === startIndex ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`Show personas ${idx + 1}-${idx + ROSTER_VISIBLE_COUNT}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
