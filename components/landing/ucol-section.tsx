"use client";

import { useRef } from "react";
import { motion, useAnimationFrame, useMotionValue, animate } from "framer-motion";
import { useTranslations } from "next-intl";

// ── Model card definitions ───────────────────────────────────────────────────
const models = [
  {
    key: "hermes",
    icon: "⚡",
    name: "Hermes",
    tagline: "Fast reasoning. Instant answers.",
    color: "#a855f7",         // violet
    border: "border-violet-500/50",
    glow: "shadow-[0_0_24px_-8px_rgba(168,85,247,0.5)]",
    badge: "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-500/30",
    accent: "from-violet-500/20 to-transparent",
  },
  {
    key: "gemini",
    icon: "🧠",
    name: "Gemini",
    tagline: "Deep analysis. Strategic thinking.",
    color: "#38bdf8",         // sky
    border: "border-sky-400/50",
    glow: "shadow-[0_0_24px_-8px_rgba(56,189,248,0.5)]",
    badge: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-400/30",
    accent: "from-sky-500/20 to-transparent",
  },
  {
    key: "claude",
    icon: "✨",
    name: "Claude",
    tagline: "Precise language. Thoughtful craft.",
    color: "#f59e0b",         // amber
    border: "border-amber-400/50",
    glow: "shadow-[0_0_24px_-8px_rgba(245,158,11,0.5)]",
    badge: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-400/30",
    accent: "from-amber-500/20 to-transparent",
  },
];

// ── Animated flow diagram ────────────────────────────────────────────────────
// SVG path for the flow: Query → UCOL → Models → KG → Response
// Laid out horizontally with a curve into the KG node in the center

const FLOW_W = 700;
const FLOW_H = 100;

// Node x positions (centered in 700px wide)
const flowNodes = [
  { id: "query",    x: 40,  y: 50, label: "Query",          color: "#6366f1" },
  { id: "ucol",     x: 190, y: 50, label: "UCOL",           color: "#8b5cf6" },
  { id: "models",   x: 350, y: 50, label: "Models",         color: "#a855f7" },
  { id: "kg",       x: 510, y: 50, label: "Knowledge Graph",color: "#38bdf8" },
  { id: "response", x: 660, y: 50, label: "Response",       color: "#10b981" },
];

// SVG connector arrows
const connectors = [
  { x1: 70, y1: 50, x2: 155, y2: 50 },
  { x1: 225, y1: 50, x2: 315, y2: 50 },
  { x1: 385, y1: 50, x2: 475, y2: 50 },
  { x1: 547, y1: 50, x2: 622, y2: 50 },
];

// Total path length for the traveling dot: sum of connector lengths
const DOT_PATH = [
  // move across all connectors in sequence
  { cx: [55, 155], cy: [50, 50] },
  { cx: [225, 315], cy: [50, 50] },
  { cx: [385, 475], cy: [50, 50] },
  { cx: [547, 622], cy: [50, 50] },
];

const TravelingDot = () => {
  // Animate a single dot across the full path using keyframes
  return (
    <motion.circle
      r="5"
      fill="#8b5cf6"
      filter="url(#dotGlow)"
      animate={{
        cx: [55, 155, 225, 315, 385, 475, 547, 622, 55],
        cy: [50, 50, 50, 50, 50, 50, 50, 50, 50],
      }}
      transition={{
        duration: 3.5,
        repeat: Infinity,
        ease: "linear",
        times: [0, 0.15, 0.2, 0.35, 0.4, 0.55, 0.6, 0.75, 1],
      }}
    />
  );
};

const FlowDiagram = () => (
  <div className="w-full overflow-x-auto">
    <svg
      viewBox={`0 0 ${FLOW_W} ${FLOW_H}`}
      className="w-full max-w-2xl mx-auto h-24"
      style={{ minWidth: 320 }}
    >
      <defs>
        <filter id="dotGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="rgba(139,92,246,0.5)" />
        </marker>
      </defs>

      {/* Connector lines */}
      {connectors.map((c, i) => (
        <motion.line
          key={i}
          x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
          stroke="rgba(139,92,246,0.35)"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
        />
      ))}

      {/* Traveling dot */}
      <TravelingDot />

      {/* Nodes */}
      {flowNodes.map((node, i) => (
        <motion.g
          key={node.id}
          style={{ originX: `${node.x}px`, originY: `${node.y}px` }}
          initial={{ opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 + i * 0.12, duration: 0.4, type: "spring", stiffness: 220 }}
        >
          <circle
            cx={node.x} cy={node.y} r={node.id === "ucol" ? 28 : 24}
            fill={node.color}
            fillOpacity={0.12}
            stroke={node.color}
            strokeWidth={node.id === "ucol" ? 2 : 1.5}
            strokeOpacity={0.7}
          />
          <text
            x={node.x} y={node.y + 4}
            textAnchor="middle"
            fontSize={node.id === "kg" ? "6.5" : "8"}
            className="fill-slate-800 dark:fill-white"
            fontWeight="600"
            fontFamily="system-ui"
            opacity={0.9}
          >
            {node.label}
          </text>
        </motion.g>
      ))}
    </svg>
  </div>
);

// ── UCOL Section ─────────────────────────────────────────────────────────────
export const UCOLSection = () => {
  const t = useTranslations("Landing.ucol");

  return (
    <section
      id="ucol"
      className="relative py-16 md:py-32 px-4 bg-white dark:bg-[#0a0d14] overflow-hidden"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-violet-500/5 dark:bg-violet-500/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 mb-6">
            {t("eyebrow")}
          </span>
          <h2
            className="font-bold tracking-tight text-slate-900 dark:text-white mb-6 font-heading"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("title")}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
            {t("subtitle")}
          </p>
        </motion.div>

        {/* Three model cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 md:mb-20">
          {models.map((model, i) => (
            <motion.div
              key={model.key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={`
                group relative rounded-2xl overflow-hidden
                bg-white dark:bg-white/[0.04]
                backdrop-blur-md
                border ${model.border}
                ${model.glow}
                transition-all duration-300
                hover:scale-[1.02] hover:-translate-y-1
              `}
            >
              {/* Accent gradient top stripe */}
              <div
                className="absolute top-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, transparent, ${model.color}, transparent)` }}
              />

              {/* Frosted glass hover overlay */}
              <div className={`absolute inset-0 bg-gradient-to-b ${model.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              <div className="relative z-10 p-8">
                {/* Icon */}
                <div className="text-4xl mb-5">{model.icon}</div>

                {/* Badge */}
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${model.badge} mb-4`}>
                  {model.name}
                </span>

                {/* Tagline */}
                <p className="text-slate-600 dark:text-slate-300 text-base leading-relaxed font-medium">
                  {t(`${model.key}Tagline`)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Flow diagram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/40 dark:bg-white/3 backdrop-blur-md p-8"
        >
          <div className="absolute -inset-px bg-gradient-to-b from-violet-400/10 to-transparent rounded-2xl pointer-events-none" />
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 tracking-widest uppercase mb-8 font-medium">
            {t("flowLabel")}
          </p>
          <FlowDiagram />
        </motion.div>
      </div>
    </section>
  );
};
