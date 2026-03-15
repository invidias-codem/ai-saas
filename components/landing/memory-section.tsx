"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";

// ── Constellation data ───────────────────────────────────────────────────────
// SVG viewport: 600 × 400
const constellationNodes = [
  { id: "ts",       x: 300, y: 200, r: 22, label: "Prefers TypeScript",  color: "#8b5cf6", delay: 0.0 },
  { id: "founder",  x: 180, y: 110, r: 18, label: "Founder",            color: "#a855f7", delay: 0.15 },
  { id: "ai",       x: 420, y: 120, r: 18, label: "Builds AI Tools",    color: "#38bdf8", delay: 0.25 },
  { id: "morning",  x: 130, y: 260, r: 15, label: "Morning person",     color: "#6366f1", delay: 0.35 },
  { id: "nextjs",   x: 460, y: 280, r: 15, label: "Uses Next.js",       color: "#38bdf8", delay: 0.45 },
  { id: "saas",     x: 240, y: 330, r: 15, label: "SaaS builder",       color: "#a855f7", delay: 0.55 },
  { id: "react",    x: 380, y: 350, r: 14, label: "React expert",       color: "#8b5cf6", delay: 0.65 },
  { id: "gpt",      x: 80,  y: 170, r: 13, label: "Uses LLMs daily",    color: "#f59e0b", delay: 0.72 },
  { id: "sprint",   x: 530, y: 180, r: 13, label: "Runs sprints",       color: "#10b981", delay: 0.80 },
  { id: "dark",     x: 160, y: 370, r: 12, label: "Dark mode only",     color: "#6366f1", delay: 0.87 },
  { id: "fire",     x: 480, y: 60,  r: 12, label: "Firebase user",      color: "#f59e0b", delay: 0.93 },
  { id: "ucol",     x: 310, y: 60,  r: 16, label: "UCOL early adopter", color: "#a855f7", delay: 1.0  },
];

const edges = [
  ["ts", "founder"],
  ["ts", "ai"],
  ["ts", "nextjs"],
  ["ts", "react"],
  ["founder", "morning"],
  ["founder", "saas"],
  ["founder", "gpt"],
  ["ai", "ucol"],
  ["ai", "fire"],
  ["ai", "sprint"],
  ["nextjs", "react"],
  ["saas", "dark"],
  ["ucol", "ts"],
  ["ucol", "fire"],
  ["sprint", "nextjs"],
];

interface NodeDef {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  color: string;
  delay: number;
}

const getNode = (id: string): NodeDef =>
  constellationNodes.find((n) => n.id === id) ?? constellationNodes[0];

// ── Constellation SVG Component ──────────────────────────────────────────────
const Constellation = () => {
  return (
    // SVG scales naturally via w-full h-auto on mobile
    <svg
      viewBox="0 0 600 420"
      className="w-full h-auto max-w-2xl mx-auto"
      aria-hidden="true"
    >
      <defs>
        <filter id="nodeGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {edges.map(([a, b], i) => {
        const na = getNode(a);
        const nb = getNode(b);
        return (
          <motion.line
            key={`edge-${a}-${b}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="rgba(139,92,246,0.18)"
            strokeWidth="1"
            initial={{ opacity: 0, pathLength: 0 }}
            whileInView={{ opacity: 1, pathLength: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              delay: 0.5 + i * 0.06,
              duration: 0.5,
              ease: "easeOut",
            }}
          />
        );
      })}

      {/* Animated pulse rings that appear in sequence */}
      {constellationNodes.map((node, i) => (
        <motion.circle
          key={`ring-${node.id}`}
          cx={node.x}
          cy={node.y}
          r={node.r + 8}
          fill="none"
          stroke={node.color}
          strokeWidth="1"
          opacity={0}
          whileInView={{
            opacity: [0, 0.3, 0],
            r: [node.r + 4, node.r + 16, node.r + 4],
          }}
          viewport={{ once: false }}
          transition={{
            delay: node.delay + 1.5 + i * 0.3,
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Nodes with scroll-driven opacity reveal */}
      {constellationNodes.map((node, i) => (
        <motion.g
          key={`node-${node.id}`}
          style={{ originX: `${node.x}px`, originY: `${node.y}px` }}
          initial={{ opacity: 0, scale: 0.4 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{
            delay: node.delay,
            duration: 0.5,
            type: "spring",
            stiffness: 200,
            damping: 18,
          }}
        >
          {/* Glow circle */}
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r + 4}
            fill={node.color}
            fillOpacity={0.08}
          />
          {/* Main circle */}
          <motion.circle
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill={node.color}
            fillOpacity={0.15}
            stroke={node.color}
            strokeWidth="1.5"
            filter="url(#nodeGlow)"
            animate={{ fillOpacity: [0.12, 0.22, 0.12] }}
            transition={{
              delay: node.delay + 1,
              duration: 2.8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          {/* Label text — dark charcoal in light mode, white in dark */}
          <text
            x={node.x}
            y={node.y + 4}
            textAnchor="middle"
            fontSize={node.r > 16 ? "8" : "6.5"}
            className="fill-slate-800 dark:fill-white"
            fontWeight="600"
            fontFamily="system-ui"
            opacity={0.9}
          >
            {node.label.length > 14
              ? node.label.split(" ").map((word, wi) => (
                  <tspan
                    key={wi}
                    x={node.x}
                    dy={wi === 0 ? (node.label.split(" ").length > 1 ? -5 : 0) : 11}
                  >
                    {word}
                  </tspan>
                ))
              : node.label}
          </text>
        </motion.g>
      ))}
    </svg>
  );
};

// ── Memory Section ───────────────────────────────────────────────────────────
export const MemorySection = () => {
  const t = useTranslations("Landing.memory");
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      // Light: warm ivory (#FAF9F7). Dark: deep midnight (#070a12).
      className="relative py-16 md:py-32 px-4 bg-[#FAF9F7] dark:bg-[#070a12] overflow-hidden"
    >
      {/* Background glows — lighter tints for ivory bg, darker for midnight */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-400/[0.08] dark:bg-violet-800/[0.10] rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-sky-400/[0.06] dark:bg-sky-800/[0.08] rounded-full blur-[100px] pointer-events-none" />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(rgba(139,92,246,0.8) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium text-sky-600 dark:text-sky-400 border border-sky-400/40 dark:border-sky-500/30 bg-sky-100/80 dark:bg-sky-500/10 mb-6">
            {t("eyebrow")}
          </span>
          <h2
            className="font-bold tracking-tight text-slate-900 dark:text-white mb-6 font-heading"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("title")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
        </motion.div>

        {/* Constellation visual — SVG scales down naturally on mobile via w-full h-auto */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.02] backdrop-blur-sm p-6 md:p-10"
        >
          <div className="absolute -inset-px bg-gradient-to-b from-violet-500/[0.08] to-transparent rounded-2xl pointer-events-none" />
          <Constellation />
        </motion.div>

        {/* Stats / callouts below constellation — 1 col mobile, 3 col sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
          {[
            { value: t("stat1Value"), label: t("stat1Label"), color: "text-violet-500 dark:text-violet-400" },
            { value: t("stat2Value"), label: t("stat2Label"), color: "text-sky-500 dark:text-sky-400" },
            { value: t("stat3Value"), label: t("stat3Label"), color: "text-amber-500 dark:text-amber-400" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.12, duration: 0.5 }}
              className="text-center p-6 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03]"
            >
              <div className={`text-3xl font-bold ${stat.color} mb-2 font-heading`}>
                {stat.value}
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
