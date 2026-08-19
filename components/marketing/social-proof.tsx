"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

export const SocialProof = () => {
  const t = useTranslations("Landing.expertV2.socialProof");

  // Compliance gate: only render testimonial card when verified values exist.
  // Placeholder values contain "[" — real customer data will not.
  const quote = t("testimonialQuote");
  const isVerified = !quote.includes("[");

  return (
    <section className="relative border-t border-white/10 bg-white/[0.02]">
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
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl">
            {t("title")}
          </h2>
        </motion.div>

        {/* Aggregate Trust Metrics Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-2xl md:text-3xl font-bold font-heading text-white mb-1">
              {t("metric1Value")}
            </div>
            <p className="text-white/60 text-sm">{t("metric1Label")}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-2xl md:text-3xl font-bold font-heading text-white mb-1">
              {t("metric2Value")}
            </div>
            <p className="text-white/60 text-sm">{t("metric2Label")}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-lg md:text-xl font-bold font-heading text-white mb-1">
              BYOK
            </div>
            <p className="text-white/60 text-sm">{t("securityNote")}</p>
          </div>
        </motion.div>

        {/* Evidence Card — gated on verified content */}
        {isVerified && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-10 max-w-3xl"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="relative z-10">
              {/* Logo placeholder */}
              <div className="mb-6">
                <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-xs text-white/40">
                  {t("testimonialCompany").slice(0, 2).toUpperCase()}
                </div>
              </div>

              {/* Quote */}
              <blockquote className="text-lg md:text-xl text-white/80 leading-relaxed mb-6">
                &ldquo;{quote}&rdquo;
              </blockquote>

              {/* Attribution */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    {t("testimonialAuthor")}
                  </div>
                  <div className="text-xs text-white/50">
                    {t("testimonialCompany")}
                  </div>
                </div>
              </div>

              {/* Measured Outcome */}
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-300">
                {t("testimonialOutcome")}
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state when unverified — preserves layout spacing */}
        {!isVerified && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-8 md:p-10 max-w-3xl flex items-center justify-center">
            <p className="text-white/30 text-sm text-center">
              Customer evidence pending verification.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
