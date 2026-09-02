"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const cards = [
  {
    key: "card1",
    icon: "🧩",
    border: "border-amber-300/50 dark:border-violet-500/40",
    glow: "shadow-md",
    accent: "from-amber-400/15 to-transparent dark:from-violet-500/15 dark:to-transparent",
    badge: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
  },
  {
    key: "card2",
    icon: "✨",
    border: "border-yellow-300/50 dark:border-sky-400/40",
    glow: "shadow-md",
    accent: "from-yellow-400/15 to-transparent dark:from-sky-500/15 dark:to-transparent",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/30",
  },
  {
    key: "card3",
    icon: "🧠",
    border: "border-orange-300/50 dark:border-amber-400/40",
    glow: "shadow-md",
    accent: "from-orange-400/15 to-transparent dark:from-amber-500/15 dark:to-transparent",
    badge: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30",
  },
  {
    key: "card4",
    icon: "🎯",
    border: "border-amber-200/60 dark:border-emerald-400/40",
    glow: "shadow-md",
    accent: "from-amber-300/15 to-transparent dark:from-emerald-500/15 dark:to-transparent",
    badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30",
  },
];

const FLOW_W = 700;
const FLOW_H = 100;

const flowNodes = [
  { id: "query", x: 40, y: 50, label: "Query", color: "#d97706" },
  { id: "memory", x: 180, y: 50, label: "Memory", color: "#f59e0b" },
  { id: "router", x: 340, y: 50, label: "Router", color: "#eab308" },
  { id: "inference", x: 510, y: 50, label: "Inference", color: "#8b5cf6" },
  { id: "response", x: 660, y: 50, label: "Response", color: "#10b981" },
];

const mobileFlowNodes = [
  { id: "query", label: "Query", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/30" },
  { id: "memory", label: "Memory", color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-400/30" },
  { id: "router", label: "Router", color: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-400/30" },
  { id: "inference", label: "Inference", color: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30" },
  { id: "response", label: "Response", color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30" },
];

const connectors = [
  { x1: 70, y1: 50, x2: 145, y2: 50 },
  { x1: 215, y1: 50, x2: 305, y2: 50 },
  { x1: 375, y1: 50, x2: 475, y2: 50 },
  { x1: 545, y1: 50, x2: 622, y2: 50 },
];

const TravelingDot = () => {
  return (
    <motion.circle
      r="5"
      fill="#d97706"
      filter="url(#dotGlow)"
      animate={{
        cx: [55, 145, 215, 305, 375, 475, 545, 622, 55],
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

const DesktopFlowDiagram = () => (
  <div className="hidden md:block w-full overflow-x-auto">
    <svg
      viewBox={`0 0 ${FLOW_W} ${FLOW_H}`}
      className="mx-auto h-24 w-full max-w-3xl"
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
          <path d="M0,0 L0,6 L6,3 z" fill="rgba(217,119,6,0.5)" />
        </marker>
      </defs>

      {connectors.map((c, i) => (
        <motion.line
          key={i}
          x1={c.x1}
          y1={c.y1}
          x2={c.x2}
          y2={c.y2}
          stroke="rgba(217,119,6,0.3)"
          strokeWidth="1.5"
          markerEnd="url(#arrow)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
        />
      ))}

      <TravelingDot />

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
            cx={node.x}
            cy={node.y}
            r={node.id === "router" ? 28 : 24}
            fill={node.color}
            fillOpacity={0.12}
            stroke={node.color}
            strokeWidth={node.id === "router" ? 2 : 1.5}
            strokeOpacity={0.7}
          />
          <text
            x={node.x}
            y={node.y + 4}
            textAnchor="middle"
            fontSize={node.id === "inference" ? "6.5" : "8"}
            className="fill-[#3f3125] dark:fill-white"
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

const MobileFlowDiagram = () => (
  <div className="md:hidden mx-auto max-w-sm">
    <div className="flex flex-col items-center gap-3">
      {mobileFlowNodes.map((node, index) => (
        <motion.div
          key={node.id}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 + index * 0.08, duration: 0.35 }}
          className="flex w-full flex-col items-center"
        >
          <div className={`w-full rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm ${node.color}`}>
            {node.label}
          </div>
          {index < mobileFlowNodes.length - 1 && (
            <div className="flex h-8 flex-col items-center justify-center">
              <div className="h-5 w-px bg-gradient-to-b from-amber-300 to-orange-400 dark:from-violet-400 dark:to-indigo-400" />
              <div className="h-2 w-2 rotate-45 border-r border-b border-orange-400 dark:border-indigo-400" />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  </div>
);

export const UCOLSection = () => {
  const t = useTranslations("Landing.ucol");

  return (
    <section
      id="ucol"
      className="landing-bg-alt relative overflow-hidden px-4 py-16 md:py-32"
    >
      <div className="landing-orb-secondary absolute top-1/2 left-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-20 text-center"
        >
          <span className="landing-badge-primary mb-6 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t("eyebrow")}
          </span>
          <h2
            className="landing-text-primary mb-6 font-heading font-bold tracking-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("title")}
          </h2>
          <p className="landing-text-secondary mx-auto max-w-3xl text-lg leading-relaxed md:text-xl">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 md:mb-20">
          {cards.map((card, i) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className={`landing-card group relative overflow-hidden rounded-2xl border ${card.border} ${card.glow} transition duration-200 hover:-translate-y-1 hover:scale-[1.02]`}
            >
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-200/80 to-transparent dark:via-white/25" />
              <div className={`absolute inset-0 bg-gradient-to-b ${card.accent} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

              <div className="relative z-10 p-8">
                <div className="mb-5 text-4xl">{card.icon}</div>
                <span className={`mb-4 inline-block rounded-full border px-3 py-1 text-xs font-semibold ${card.badge}`}>
                  {t(`${card.key}Title`)}
                </span>
                <p className="landing-text-secondary text-base font-medium leading-relaxed">
                  {t(`${card.key}Body`)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="landing-card relative rounded-2xl border p-6 md:p-8"
        >
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-amber-300/20 to-transparent dark:from-violet-400/10 pointer-events-none" />
          <p className="landing-text-muted mb-6 md:mb-8 text-center text-sm font-medium uppercase tracking-widest">
            {t("flowLabel")}
          </p>
          <MobileFlowDiagram />
          <DesktopFlowDiagram />
        </motion.div>
      </div>
    </section>
  );
};
