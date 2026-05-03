"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";

const STAR_COUNT = 55;

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

const ParticleField = () => {
  const [stars] = useState<Star[]>(() => generateStars(STAR_COUNT));

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

const MiniGraph = () => {
  const nodes = [
    { id: "ucol", x: 200, y: 140, label: "UCOL", color: "#d97706", r: 28 },
    { id: "open", x: 80, y: 60, label: "Open", color: "#f59e0b", r: 20 },
    { id: "frontier", x: 320, y: 60, label: "Frontier", color: "#8b5cf6", r: 20 },
    { id: "router", x: 200, y: 240, label: "Router", color: "#f59e0b", r: 20 },
    { id: "memory", x: 60, y: 210, label: "Memory", color: "#eab308", r: 14 },
    { id: "context", x: 340, y: 200, label: "Context", color: "#6366f1", r: 14 },
  ];

  const edges = [
    ["ucol", "open"],
    ["ucol", "frontier"],
    ["ucol", "router"],
    ["ucol", "memory"],
    ["ucol", "context"],
    ["open", "memory"],
    ["frontier", "context"],
  ];

  const getNode = (id: string) => nodes.find((n) => n.id === id)!;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: 0.8 }}
      className="relative mx-auto w-full max-w-[420px]"
    >
      <svg viewBox="0 0 400 290" className="w-full h-auto drop-shadow-2xl">
        {edges.map(([a, b], i) => {
          const na = getNode(a);
          const nb = getNode(b);
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
              stroke="rgba(217,119,6,0.24)"
              strokeWidth="1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 + i * 0.12, duration: 0.4 }}
            />
          );
        })}

        <motion.circle
          r="3"
          fill="#d97706"
          animate={{
            cx: [80, 200, 320, 200, 80],
            cy: [60, 140, 60, 140, 60],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          opacity={0.9}
        />

        {nodes.map((node, i) => (
          <motion.g
            key={node.id}
            style={{ originX: `${node.x}px`, originY: `${node.y}px` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.0 + i * 0.15, duration: 0.4, type: "spring", stiffness: 200 }}
          >
            <motion.circle
              cx={node.x}
              cy={node.y}
              r={node.r + 6}
              fill="none"
              stroke={node.color}
              strokeWidth="1"
              opacity={0.2}
              animate={{ r: [node.r + 6, node.r + 10, node.r + 6] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={node.color}
              fillOpacity={0.15}
              stroke={node.color}
              strokeWidth="1.5"
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize={node.r > 20 ? "9" : "7"}
              className="fill-[#3f3125] dark:fill-white"
              fontWeight="600"
              fontFamily="system-ui"
            >
              {node.label}
            </text>
          </motion.g>
        ))}
      </svg>
    </motion.div>
  );
};

export const HeroSection = () => {
  const t = useTranslations("Landing.hero");

  return (
    <section className="landing-bg-main relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <ParticleField />

      <div className="landing-orb-primary absolute top-[-20%] left-[-10%] h-[700px] w-[700px] rounded-full blur-[120px] pointer-events-none" />
      <div className="landing-orb-secondary absolute bottom-[-10%] right-[-5%] h-[500px] w-[500px] rounded-full blur-[120px] pointer-events-none" />
      <div className="landing-orb-tertiary absolute top-1/2 left-1/2 h-[400px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] pointer-events-none" />

      <div className="landing-grid-overlay absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.03]" />

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
          <div className="landing-card-strong relative rounded-2xl p-6">
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-amber-300/20 to-transparent dark:from-violet-500/10 pointer-events-none" />
            <p className="text-xs tracking-widest uppercase mb-4 font-medium text-amber-700 dark:text-violet-400/80">
              {t("graphLabel")}
            </p>
            <MiniGraph />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-2xl bg-gradient-to-t from-[#FAF7F0]/95 to-transparent dark:from-[#080b14] pointer-events-none" />
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
    </section>
  );
};
