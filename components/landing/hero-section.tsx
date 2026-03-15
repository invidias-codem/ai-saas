"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useAnimationFrame } from "framer-motion";
import { ArrowRightIcon } from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";

// ── Constellation particle field (pure CSS + Framer Motion, no canvas) ──────
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
          // Dark: white dots. Light: dark slate dots so they read on ivory bg.
          className="absolute rounded-full bg-slate-600 dark:bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
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

// ── Mini knowledge graph preview (hero visual) ───────────────────────────────
const MiniGraph = () => {
  const nodes = [
    { id: "ucol", x: 200, y: 140, label: "UCOL", color: "#8b5cf6", r: 28 },
    { id: "hermes", x: 80, y: 60, label: "Hermes ⚡", color: "#a855f7", r: 20 },
    { id: "gemini", x: 320, y: 60, label: "Gemini 🧠", color: "#38bdf8", r: 20 },
    { id: "claude", x: 200, y: 240, label: "Claude ✨", color: "#f59e0b", r: 20 },
    { id: "mem1", x: 60, y: 210, label: "Memory", color: "#6366f1", r: 14 },
    { id: "mem2", x: 340, y: 200, label: "Context", color: "#6366f1", r: 14 },
  ];

  const edges = [
    ["ucol", "hermes"],
    ["ucol", "gemini"],
    ["ucol", "claude"],
    ["ucol", "mem1"],
    ["ucol", "mem2"],
    ["hermes", "mem1"],
    ["gemini", "mem2"],
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
        {/* Edges */}
        {edges.map(([a, b], i) => {
          const na = getNode(a);
          const nb = getNode(b);
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
              stroke="rgba(139,92,246,0.3)"
              strokeWidth="1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 + i * 0.12, duration: 0.4 }}
            />
          );
        })}

        {/* Animated traveling dot on main edge */}
        <motion.circle r="3" fill="#8b5cf6"
          animate={{
            cx: [80, 200, 320, 200, 80],
            cy: [60, 140, 60, 140, 60],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          opacity={0.9}
        />

        {/* Nodes */}
        {nodes.map((node, i) => (
          <motion.g
            key={node.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.0 + i * 0.15, duration: 0.4, type: "spring", stiffness: 200 }}
          >
            {/* Glow ring */}
            <motion.circle
              cx={node.x} cy={node.y} r={node.r + 6}
              fill="none"
              stroke={node.color}
              strokeWidth="1"
              opacity={0.2}
              animate={{ r: [node.r + 6, node.r + 10, node.r + 6] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
            />
            {/* Main circle */}
            <circle
              cx={node.x} cy={node.y} r={node.r}
              fill={node.color}
              fillOpacity={0.15}
              stroke={node.color}
              strokeWidth="1.5"
            />
            {/* Label — fill-slate-800 in light mode, fill-white in dark */}
            <text
              x={node.x} y={node.y + 4}
              textAnchor="middle"
              fontSize={node.r > 20 ? "9" : "7"}
              className="fill-slate-800 dark:fill-white"
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

// ── Hero Section ─────────────────────────────────────────────────────────────
export const HeroSection = () => {
  const t = useTranslations("Landing.hero");

  return (
    // Light: soft lavender-to-cream gradient. Dark: deep midnight #080b14.
    <section className="relative min-h-screen flex flex-col justify-center items-center overflow-hidden bg-gradient-to-br from-violet-50 via-slate-50 to-indigo-50 dark:from-[#080b14] dark:via-[#080b14] dark:to-[#080b14]">
      {/* Particle constellation background */}
      <ParticleField />

      {/* Ambient glows — softer in light mode */}
      <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] rounded-full bg-violet-300/15 dark:bg-violet-700/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-300/15 dark:bg-indigo-600/8 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full bg-violet-200/10 dark:bg-violet-900/10 blur-[100px] pointer-events-none" />

      {/* Grid overlay — violet-tinted so it reads on both light and dark */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(139,92,246,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="container relative z-10 mx-auto px-4 text-center flex flex-col items-center pt-24 pb-16">
        {/* Eyebrow badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-400/40 dark:border-violet-500/30 bg-violet-100/80 dark:bg-violet-500/10 backdrop-blur-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-pulse" />
          <span className="text-sm text-violet-700 dark:text-violet-300 font-medium tracking-wide">
            {t("badge")}
          </span>
        </motion.div>

        {/* Headline — two acts */}
        <div className="mb-6 max-w-5xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-slate-900 dark:text-white font-bold tracking-tight leading-[1.05] font-heading"
            style={{ fontSize: "clamp(2.8rem, 7.5vw, 6.5rem)" }}
          >
            {t("headline1")}
            <span className="block text-slate-500 dark:text-slate-400 mt-1">{t("headline2")}</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <span
              className="block font-bold tracking-tight leading-tight mt-2 bg-gradient-to-r from-violet-500 via-purple-400 to-indigo-500 dark:from-violet-400 dark:via-purple-300 dark:to-indigo-400 bg-clip-text text-transparent font-heading"
              style={{ fontSize: "clamp(2.8rem, 7.5vw, 6.5rem)" }}
            >
              {t("headline3")}
            </span>
          </motion.div>
        </div>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.3 }}
          className="text-slate-600 dark:text-slate-400 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          {t("subhead")}
        </motion.p>

        {/* CTAs — stack vertically on mobile, side-by-side on sm+ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20"
        >
          <Link href="/dashboard">
            <Button
              size="lg"
              className="rounded-full px-8 py-6 text-base bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 shadow-[0_0_32px_-8px_rgba(139,92,246,0.7)] hover:shadow-[0_0_48px_-8px_rgba(139,92,246,0.85)] transition-all duration-300"
            >
              {t("cta")}
              <ArrowRightIcon className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <a href="#ucol">
            <Button
              variant="outline"
              size="lg"
              className="rounded-full px-8 py-6 text-base border-slate-300 dark:border-white/15 bg-slate-100/80 dark:bg-white/5 text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-white/10 backdrop-blur-sm transition-all"
            >
              {t("ctaSecondary")}
            </Button>
          </a>
        </motion.div>

        {/* Knowledge graph preview */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.7 }}
          className="w-full max-w-lg mx-auto relative"
        >
          <div className="relative rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white/60 dark:bg-white/[0.03] backdrop-blur-md p-6">
            <div className="absolute -inset-px bg-gradient-to-b from-violet-500/10 to-transparent rounded-2xl pointer-events-none" />
            <p className="text-xs text-violet-600 dark:text-violet-400/80 tracking-widest uppercase mb-4 font-medium">
              {t("graphLabel")}
            </p>
            <MiniGraph />
          </div>
          {/* Bottom fade — matches the section bg in both modes */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-violet-50/90 dark:from-[#080b14] to-transparent rounded-b-2xl pointer-events-none" />
        </motion.div>
      </div>

      {/* Section fade to next — uses CSS variable so it matches both modes */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
    </section>
  );
};
