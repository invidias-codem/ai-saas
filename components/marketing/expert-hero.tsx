"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { RippleButton } from "@/components/landing/ripple-button";

type Variant = "a" | "b" | "c";

interface ExpertHeroProps {
  variant?: Variant;
}

export const ExpertHero = ({ variant }: ExpertHeroProps) => {
  const t = useTranslations("Landing.expertV2");
  const vt = useTranslations(
    variant ? `Landing.expertV2.abVariants.${variant}` : "Landing.expertV2"
  );

  // Use variant-specific copy when available, fall back to primary hero
  const badge = variant ? vt("badge") : t("badge");
  const headline1 = variant ? vt("headline1") : t("headline1");
  const headline2 = variant ? vt("headline2") : t("headline2");
  const subhead = variant ? vt("subhead") : t("subhead");
  const ctaPrimary = variant ? vt("ctaHeroPrimary") : t("ctaHeroPrimary");
  const ctaSecondary = variant ? vt("ctaSecondary") : t("ctaSecondary");

  return (
    <div className="relative min-h-screen bg-[#050505] text-white overflow-hidden">
      {/* ── Animated gradient orbs ── */}
      <div className="absolute top-[-20%] left-[-10%] h-[800px] w-[800px] rounded-full bg-gradient-to-br from-purple-600/20 via-violet-500/10 to-transparent blur-[120px] pointer-events-none animate-pulse" />
      <div
        className="absolute bottom-[-10%] right-[-5%] h-[600px] w-[600px] rounded-full bg-gradient-to-tl from-blue-500/15 via-cyan-400/10 to-transparent blur-[100px] pointer-events-none animate-pulse"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute top-[40%] left-[60%] h-[400px] w-[400px] rounded-full bg-gradient-to-br from-pink-500/10 via-rose-400/5 to-transparent blur-[80px] pointer-events-none animate-pulse"
        style={{ animationDelay: "4s" }}
      />

      {/* ── Subtle grid overlay ── */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* ── Noise texture ── */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10">
        {/* ═══════════════════════════════════════════════════════════════
            HERO — Mobile-safe: vertical slide, 48px touch targets,
            constrained halo. Copy length targets from Figma guide:
              eyebrow 2–3 · headline 8–15 · sub 25–40 · CTA 2–4
            ═══════════════════════════════════════════════════════════════ */}
        <section className="mx-auto max-w-7xl px-6 pt-28 pb-20 md:pt-32 md:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* ── Left: copy block ── */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="lg:col-span-7 max-w-2xl"
            >
              {/* Eyebrow — 3 words, category hook */}
              <motion.span
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/70 mb-8"
              >
                {t("badge")}
              </motion.span>

              {/* Headline — outcome-oriented, no generic "expert" */}
              <h1
                className="font-heading font-bold tracking-tight leading-[1.05] mb-6"
                style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
              >
                <motion.span
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="block"
                >
                  {t("headline1")}
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="block text-white/50"
                >
                  {t("headline2")}
                </motion.span>
              </h1>

              {/* Subheadline — Lattice = platform, expert = output */}
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-white/60 text-lg md:text-xl leading-relaxed max-w-xl mb-10"
              >
                {t("subhead")}
              </motion.p>

              {/* CTAs — 48px min touch target, full-width on mobile */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay: 0.5 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <Link href="/onboarding" className="w-full sm:w-auto">
                  <RippleButton
                    golden
                    className="group w-full sm:w-auto bg-white text-black hover:bg-white/90 rounded-full px-8 py-4 md:py-6 min-h-[48px] text-base font-semibold transition-colors duration-200 active:scale-[0.97]"
                  >
                    {t("ctaHeroPrimary")}
                    <ArrowRightIcon className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
                  </RippleButton>
                </Link>
                <Link href="#how-it-works" className="w-full sm:w-auto">
                  <RippleButton
                    className="group w-full sm:w-auto border border-white/20 text-white hover:bg-white/10 hover:border-white/30 rounded-full px-8 py-4 md:py-6 min-h-[48px] text-base backdrop-blur-sm transition-all duration-200 active:scale-[0.97]"
                  >
                    {t("ctaSecondary")}
                  </RippleButton>
                </Link>
              </motion.div>
            </motion.div>

            {/* ── Right: interactive preview card (mobile-safe) ── */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="lg:col-span-5 relative overflow-hidden"
            >
              {/* Glow halo — constrained to prevent mobile scroll bleed */}
              <div className="absolute -inset-4 md:-inset-8 bg-gradient-to-br from-purple-600/15 via-violet-500/8 to-blue-500/15 rounded-3xl blur-3xl pointer-events-none" />

              {/* Floating card wrapper */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {/* Gradient border via 1px padding trick */}
                <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-purple-500/40 via-violet-500/20 to-blue-500/40">
                  <div className="relative rounded-2xl bg-[#0a0a0f]/90 backdrop-blur-xl overflow-hidden">
                    {/* Window chrome */}
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-white/[0.03]">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      <span className="ml-3 text-xs text-white/40 font-mono">
                        workspace-expert
                      </span>
                    </div>

                    {/* Chat area — tighter padding on mobile */}
                    <div className="p-4 md:p-5 space-y-4">
                      {/* User message */}
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-4 py-2.5 text-sm text-white/90">
                          Summarize last week&apos;s repository pull requests
                          into a risk brief for the product team.
                        </div>
                      </div>

                      {/* Bot response */}
                      <div className="flex justify-start">
                        <div className="max-w-[90%] space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-[8px] font-bold">
                              AI
                            </div>
                            <span className="text-xs text-white/40">
                              Expert
                            </span>
                          </div>
                          <div className="text-sm text-white/70 leading-relaxed">
                            <p className="mb-2">
                              Analyzed 12 PRs from the past week. Key findings:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-white/60">
                              <li>
                                3 high-risk changes touching auth middleware
                              </li>
                              <li>
                                Refactor in payment module needs review
                              </li>
                              <li>All other changes are low-risk</li>
                            </ul>
                          </div>

                          {/* Action badge — proves "send work forward" claim */}
                          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-300">
                            <svg
                              className="w-3 h-3"
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
                            Export to Slack #product-team
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </div>
    </div>
  );
};
