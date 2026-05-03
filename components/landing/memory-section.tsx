"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const constellationNodes = [
  { id: "ts",       x: 300, y: 200, r: 22, label: "Prefers TypeScript",  color: "#d97706", delay: 0.0 },
  { id: "founder",  x: 180, y: 110, r: 18, label: "Founder",            color: "#f59e0b", delay: 0.15 },
  { id: "ai",       x: 420, y: 120, r: 18, label: "Builds AI Tools",    color: "#8b5cf6", delay: 0.25 },
  { id: "morning",  x: 130, y: 260, r: 15, label: "Morning person",     color: "#eab308", delay: 0.35 },
  { id: "nextjs",   x: 460, y: 280, r: 15, label: "Uses Next.js",       color: "#38bdf8", delay: 0.45 },
  { id: "saas",     x: 240, y: 330, r: 15, label: "SaaS builder",       color: "#f59e0b", delay: 0.55 },
  { id: "react",    x: 380, y: 350, r: 14, label: "React expert",       color: "#8b5cf6", delay: 0.65 },
  { id: "gpt",      x: 80,  y: 170, r: 13, label: "Uses LLMs daily",    color: "#f59e0b", delay: 0.72 },
  { id: "sprint",   x: 530, y: 180, r: 13, label: "Runs sprints",       color: "#10b981", delay: 0.80 },
  { id: "dark",     x: 160, y: 370, r: 12, label: "Dark mode only",     color: "#6366f1", delay: 0.87 },
  { id: "fire",     x: 480, y: 60,  r: 12, label: "Firebase user",      color: "#f59e0b", delay: 0.93 },
  { id: "ucol",     x: 310, y: 60,  r: 16, label: "UCOL early adopter", color: "#d97706", delay: 1.0  },
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

const Constellation = () => {
  return (
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

      {edges.map(([a, b], i) => {
        const na = getNode(a);
        const nb = getNode(b);
        return (
          <motion.line
            key={`edge-${a}-${b}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="rgba(217,119,6,0.18)"
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
          <circle
            cx={node.x}
            cy={node.y}
            r={node.r + 4}
            fill={node.color}
            fillOpacity={0.08}
          />
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
          <text
            x={node.x}
            y={node.y + 4}
            textAnchor="middle"
            fontSize={node.r > 16 ? "8" : "6.5"}
            className="fill-[#3f3125] dark:fill-white"
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

export const MemorySection = () => {
  const t = useTranslations("Landing.memory");
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      className="landing-bg-main relative overflow-hidden px-4 py-16 md:py-32"
    >
      <div className="landing-orb-primary absolute top-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full blur-[100px] pointer-events-none" />
      <div className="landing-orb-secondary absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full blur-[100px] pointer-events-none" />

      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] dark:opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(rgba(245,158,11,0.55) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <span className="landing-badge-secondary mb-6 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t("eyebrow")}
          </span>
          <h2
            className="landing-text-primary mb-6 font-heading font-bold tracking-tight"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
          >
            {t("title")}
          </h2>
          <p className="landing-text-secondary mx-auto max-w-2xl text-lg leading-relaxed md:text-xl">
            {t("subtitle")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="landing-card-strong relative rounded-2xl p-6 md:p-10"
        >
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-amber-300/20 to-transparent dark:from-violet-500/[0.08] pointer-events-none" />
          <Constellation />
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { value: t("stat1Value"), label: t("stat1Label"), color: "text-amber-600 dark:text-violet-400" },
            { value: t("stat2Value"), label: t("stat2Label"), color: "text-violet-600 dark:text-sky-400" },
            { value: t("stat3Value"), label: t("stat3Label"), color: "text-emerald-600 dark:text-amber-400" },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.12, duration: 0.5 }}
              className="landing-card rounded-xl p-6 text-center"
            >
              <div className={`mb-2 text-3xl font-heading font-bold ${stat.color}`}>
                {stat.value}
              </div>
              <div className="landing-text-secondary text-sm">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
