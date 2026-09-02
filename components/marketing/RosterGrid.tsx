"use client";

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "lucide-react";
import { CURATED_PERSONAS } from "@/lib/constants/personas";
import { usePricingModal } from "@/lib/store/pricing-modal-store";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false // server snapshot
  );
}

export const RosterGrid = () => {
  const t = useTranslations("Landing.expert.cta.roster");
  const [startIndex, setStartIndex] = useState(0);
  const { open: openPricingModal } = usePricingModal();
  const reducedMotion = useReducedMotion();

  // Show 1 card on mobile, 3 on desktop
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const visibleCount = isDesktop ? 3 : 1;

  const rotate = useCallback(() => {
    setStartIndex((prev) => (prev + 1) % CURATED_PERSONAS.length);
  }, []);

  useEffect(() => {
    // Never auto-rotate for users with vestibular motion sensitivity —
    // dots remain fully manual.
    if (reducedMotion) return;
    const timer = setInterval(rotate, 6000);
    return () => clearInterval(timer);
  }, [rotate, reducedMotion]);

  const extended = [
    ...CURATED_PERSONAS,
    ...CURATED_PERSONAS,
    ...CURATED_PERSONAS,
  ];

  const offset = CURATED_PERSONAS.length;
  const cardWidth = 100 / visibleCount;

  return (
    <section id="roster" className="border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
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
          <p className="text-white/55 text-lg max-w-2xl">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="overflow-hidden">
          <motion.div
            className="flex gap-6"
            style={{ touchAction: "pan-y" }}
            animate={{ x: -((offset + startIndex) * cardWidth) + "%" }}
            transition={
              reducedMotion
                ? { duration: 0.15, ease: "easeOut" } // instant-ish swap, no lateral travel
                : { duration: 0.55, ease: EASE_IN_OUT }
            }
          >
            {extended.map((persona, i) => (
              <div
                key={`${persona.id}-${i}`}
                className="flex-shrink-0"
                style={{ width: `${cardWidth}%` }}
              >
                <div className="group relative rounded-2xl border border-white/5 bg-white/[0.02] p-8 transition-colors duration-200 hover:bg-white/[0.04] flex flex-col h-full backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="relative z-10 flex-1">
                    <div className="mb-5 text-4xl">{persona.icon}</div>
                    <span className="mb-4 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                      {persona.role}
                    </span>
                    <h3 className="text-xl font-bold mb-3 font-heading text-white">
                      {persona.title}
                    </h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-6">
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
                    <button
                      onClick={() => openPricingModal()}
                      className="group/link inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition min-h-[48px]"
                    >
                      {t("cta")}
                      <ArrowRightIcon className="h-4 w-4 transition-transform duration-150 group-hover/link:translate-x-1" />
                    </button>
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
              className={`h-2 rounded-full transition-all duration-200 ${
                idx === startIndex ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`Show personas ${idx + 1}-${idx + visibleCount}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
