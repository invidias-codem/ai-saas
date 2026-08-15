"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "lucide-react";

interface ExpertCard {
  id: string;
  icon: string;
  border: string;
  glow: string;
  accent: string;
  badge: string;
  tags: string[];
}

const EXPERTS: ExpertCard[] = [
  {
    id: "technical-apparel",
    icon: "🧬",
    border: "border-white/10 hover:border-white/25",
    glow: "rounded-2xl",
    accent: "from-white/10 to-transparent",
    badge: "bg-white/10 text-white border-white/20",
    tags: ["Puff Print", "Tech Pack", "Sourcing"],
  },
  {
    id: "systems-architect",
    icon: "⚙️",
    border: "border-white/10 hover:border-white/25",
    glow: "rounded-2xl",
    accent: "from-white/10 to-transparent",
    badge: "bg-white/10 text-white border-white/20",
    tags: ["RAG", "Orchestration", "Edge"],
  },
  {
    id: "commerce-engineer",
    icon: "🛍",
    border: "border-white/10 hover:border-white/25",
    glow: "rounded-2xl",
    accent: "from-white/10 to-transparent",
    badge: "bg-white/10 text-white border-white/20",
    tags: ["Next.js", "Shopify", "Analytics"],
  },
];

export const RosterGrid = () => {
  const t = useTranslations("Landing.expert.cta.roster");

  return (
    <section className="border-t border-white/10">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
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
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
            {t("title")}
          </h2>
          <p className="text-white/60 text-lg max-w-2xl">
            {t("subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {EXPERTS.map((expert, i) => (
            <motion.div
              key={expert.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`group relative rounded-2xl border ${expert.border} ${expert.glow} bg-white/[0.03] p-8 hover:bg-white/[0.05] transition-all duration-300 flex flex-col`}
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative z-10 flex-1">
                <div className="mb-5 text-4xl">{expert.icon}</div>

                <span className={`mb-4 inline-block rounded-full border px-3 py-1 text-xs font-semibold ${expert.badge}`}>
                  {t(`${expert.id}.role`)}
                </span>

                <h3 className="text-xl font-bold mb-3 font-heading">
                  {t(`${expert.id}.title`)}
                </h3>

                <p className="text-white/60 text-sm leading-relaxed mb-6">
                  {t(`${expert.id}.description`)}
                </p>

                <div className="flex flex-wrap gap-2">
                  {expert.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="relative z-10 mt-8">
                <Link
                  href={`/expert/${expert.id}`}
                  className="group/link inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
                >
                  {t("cta")}
                  <ArrowRightIcon className="h-4 w-4 transition-transform group-hover/link:translate-x-1" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
