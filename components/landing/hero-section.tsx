"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";
import { GuestChat } from "@/components/landing/guest-chat";

const STAR_COUNT = 32;

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
}

function generateStars(count: number): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    opacity: Math.random() * 0.5 + 0.1,
    duration: Math.random() * 4 + 3,
    delay: Math.random() * 5,
  }));
}

// Respects the user's reduced-motion preference: skips the animation loop
// entirely for accessibility and to avoid needless main-thread work / battery
// drain on the most bounce-prone (mobile) surface.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

const ParticleField = () => {
  const reducedMotion = usePrefersReducedMotion();
  const [stars] = useState<Star[]>(() => generateStars(STAR_COUNT));

  // No animated particles for users who asked for reduced motion.
  if (reducedMotion) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-amber-300/80 dark:bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            boxShadow: "0 0 8px 1px rgba(251, 191, 36, 0.28)",
          }}
          animate={{
            opacity: [star.opacity * 0.4, star.opacity, star.opacity * 0.4],
            scale: [1, 1.4, 1],
          }}
          transition={{
            duration: star.duration,
            delay: star.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};

export const HeroSection = () => {
  const t = useTranslations("Landing.hero");

  return (
    <section className="landing-bg-main relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <ParticleField />

      <div className="landing-orb-primary absolute top-[-20%] left-[-10%] h-[700px] w-[700px] rounded-full blur-[60px] dark:blur-[120px] opacity-20 dark:opacity-100 pointer-events-none" />
      <div className="landing-orb-secondary absolute bottom-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full blur-[60px] dark:blur-[120px] opacity-20 dark:opacity-100 pointer-events-none" />
      <div className="landing-orb-tertiary absolute top-1/2 left-1/2 h-[400px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[60px] dark:blur-[100px] opacity-20 dark:opacity-100 pointer-events-none" />

      <div className="landing-grid-overlay absolute inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.03]" />

      <div className="container relative z-10 mx-auto flex flex-col items-center px-4 pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="landing-badge-primary mb-10 inline-flex items-center gap-2 rounded-full px-4 py-1.5 backdrop-blur-sm"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-violet-400 animate-pulse" />
          <span className="text-sm font-medium tracking-wide">
            {t("badge")}
          </span>
        </motion.div>

        <div className="mb-6 max-w-5xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="landing-text-primary font-heading font-bold tracking-tight leading-[1.05]"
            style={{ fontSize: "clamp(2.8rem, 7.5vw, 6.5rem)" }}
          >
            {t("headline1")}
            <span className="landing-text-secondary mt-1 block">{t("headline2")}</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <span
              className="landing-headline-gradient mt-2 block font-heading font-bold tracking-tight leading-tight"
              style={{ fontSize: "clamp(2.8rem, 7.5vw, 6.5rem)" }}
            >
              {t("headline3")}
            </span>
          </motion.div>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.3 }}
          className="landing-text-secondary mb-12 max-w-2xl mx-auto text-lg leading-relaxed md:text-xl"
        >
          {t("subhead")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.5 }}
          className="mb-20 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link href="/dashboard">
            <Button
              size="lg"
              className="landing-cta-primary rounded-full px-8 py-6 text-base transition-all duration-300 hover:shadow-[0_0_48px_-8px_rgba(245,158,11,0.55)] dark:hover:shadow-[0_0_48px_-8px_rgba(139,92,246,0.85)]"
            >
              {t("cta")}
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <a href="#ucol">
            <Button
              variant="outline"
              size="lg"
              className="landing-cta-secondary rounded-full px-8 py-6 text-base backdrop-blur-sm"
            >
              {t("ctaSecondary")}
            </Button>
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.7 }}
          className="relative mx-auto w-full max-w-lg"
        >
          <GuestChat />
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
    </section>
  );
};
