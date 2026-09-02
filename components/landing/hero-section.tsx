"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";
import { GuestChat } from "@/components/landing/guest-chat";

// Custom Emil-style easing curves
const EASE_OUT = [0.23, 1, 0.32, 1] as const; // enter / move-to-rest
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const; // morphing / closing
const EASE = [0.4, 0, 0.2, 1] as const; // hover / color

// Respects reduced-motion preference
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

export const HeroSection = () => {
  const t = useTranslations("Landing.hero");
  const reducedMotion = usePrefersReducedMotion();

  // Animation is interruptible: we use CSS transitions / short framer-motion
  // durations so state changes never feel slow or jarring.
  const heroVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.55,
        delay: 0.05 + i * 0.08,
        ease: EASE_OUT,
      },
    }),
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* One subtle background glow instead of many competing orbs */}
      <div
        className="absolute top-[10%] left-1/2 h-[520px] w-[720px] -translate-x-1/2 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto flex flex-col items-center px-4 pt-24 pb-20 text-center">
        {/* Badge */}
        <motion.div
          custom={0}
          variants={heroVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/[0.07] px-4 py-1.5 backdrop-blur-sm"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400" />
          <span className="text-sm font-medium tracking-wide text-foreground/90">
            {t("badge")}
          </span>
        </motion.div>

        {/* Headline */}
        <div className="mb-6 max-w-5xl mx-auto">
          <motion.h1
            custom={1}
            variants={heroVariants}
            initial="hidden"
            animate="visible"
            className="font-heading font-bold tracking-tight leading-[1.08] text-foreground"
            style={{ fontSize: "clamp(2.6rem, 7vw, 5.5rem)" }}
          >
            {t("headline1")}
            <span className="mt-1 block text-foreground/55">{t("headline2")}</span>
          </motion.h1>

          <motion.div
            custom={2}
            variants={heroVariants}
            initial="hidden"
            animate="visible"
          >
            <span
              className="mt-2 block bg-gradient-to-r from-violet-600 via-purple-500 to-indigo-600 bg-clip-text font-heading font-bold tracking-tight leading-tight text-transparent"
              style={{ fontSize: "clamp(2.6rem, 7vw, 5.5rem)" }}
            >
              {t("headline3")}
            </span>
          </motion.div>
        </div>

        {/* Subhead */}
        <motion.p
          custom={3}
          variants={heroVariants}
          initial="hidden"
          animate="visible"
          className="mb-10 max-w-2xl mx-auto text-lg leading-relaxed text-foreground/60 md:text-xl"
        >
          {t("subhead")}
        </motion.p>

        {/* CTAs */}
        <motion.div
          custom={4}
          variants={heroVariants}
          initial="hidden"
          animate="visible"
          className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link href="/dashboard">
            <Button
              size="lg"
              className="h-12 rounded-full bg-foreground text-background px-8 text-base font-semibold transition active:scale-[0.97] md:text-lg"
            >
              {t("cta")}
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <a href="#ucol">
            <Button
              variant="outline"
              size="lg"
              className="h-12 rounded-full border border-foreground/15 bg-transparent px-8 text-base backdrop-blur-sm transition active:scale-[0.97] md:text-lg"
            >
              {t("ctaSecondary")}
            </Button>
          </a>
        </motion.div>

        {/* Guest chat */}
        <motion.div
          custom={5}
          variants={heroVariants}
          initial="hidden"
          animate="visible"
          className="relative mx-auto w-full max-w-lg"
        >
          <GuestChat />
        </motion.div>
      </div>

      {/* Soft fade into next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </div>
  );
};
