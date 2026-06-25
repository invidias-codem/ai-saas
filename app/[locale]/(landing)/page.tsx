"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import {
  ChatBubbleIcon,
  CodeIcon,
  DiscIcon,
  ImageIcon,
  VideoIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { motion } from "framer-motion";
import { HeroSection } from "@/components/landing/hero-section";
import { UCOLSection } from "@/components/landing/ucol-section";
import { MemorySection } from "@/components/landing/memory-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { ComplianceSection } from "@/components/landing/compliance-section";
import { FeatureCard } from "@/components/landing/feature-card";
import { Testimonials } from "@/components/landing/testimonials";
import { useTranslations } from "next-intl";

const LandingPage = () => {
  const t = useTranslations("Landing");

  const features = [
    {
      label: t("features.conversation"),
      icon: ChatBubbleIcon,
      description: t("features.conversationDesc"),
      color: "text-sky-500",
      bgColor: "bg-sky-500/10",
    },
    {
      label: t("features.code"),
      icon: CodeIcon,
      description: t("features.codeDesc"),
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: t("features.research"),
      icon: RocketIcon,
      description: t("features.researchDesc"),
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      label: t("features.hybrid"),
      icon: VideoIcon,
      description: t("features.hybridDesc"),
      color: "text-pink-600",
      bgColor: "bg-pink-600/10",
    },
    {
      label: t("features.memoryLayer"),
      icon: DiscIcon,
      description: t("features.memoryLayerDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      label: t("features.infrastructure"),
      icon: ImageIcon,
      description: t("features.infrastructureDesc"),
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative selection:bg-purple-500/30 selection:text-slate-900 dark:selection:text-white">
      <main className="relative z-10 flex-grow pt-16">
        {/* 1 — Hero: Own your memory. */}
        <HeroSection />

        {/* 2 — UCOL: Hybrid orchestration across open and frontier models. */}
        <UCOLSection />

        {/* 3 — Memory: Persistent context across every inference path. */}
        <MemorySection />

        {/* 4 — Infrastructure control: self-hosted OSS + premium fallback. */}
        <InfrastructureSection />

        {/* 5 — Compliance: Regulatory frameworks for regulated industries */}
        <ComplianceSection />

        {/* 6 — Features Grid: Platform capabilities built on memory-native AI. */}
        <section className="px-4 py-16 md:py-24 max-w-7xl mx-auto relative cursor-default">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[400px] bg-violet-500/5 dark:bg-indigo-500/10 rounded-full blur-[80px] -z-10" />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6 font-heading">
              {t("features.title")}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {t("features.subtitle")}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.label}
                {...feature}
                delay={i * 0.1}
              />
            ))}
          </div>
        </section>

        <Testimonials />

        {/* 6 — CTA: Build on a context layer you can actually own. */}
        <section className="py-16 md:py-24 text-center px-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-background to-violet-50 dark:from-indigo-950/60 dark:via-background dark:to-indigo-950/60 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[320px] bg-violet-400/10 dark:bg-violet-500/12 rounded-full blur-[80px] pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl mx-auto relative z-10 space-y-8"
          >
            <h2
              className="font-bold text-foreground font-heading tracking-tight"
              style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
            >
              {t("cta.title")}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t("cta.subtitle")}
            </p>
            <Link href="/dashboard">
              <Button
                size="lg"
                className="rounded-full px-10 py-7 text-base md:text-lg font-semibold bg-violet-700 dark:bg-white text-white dark:text-violet-900 hover:opacity-90 transition-all duration-200"
              >
                {t("cta.button")}
              </Button>
            </Link>
          </motion.div>
        </section>
      </main>

      <footer className="py-12 border-t border-border bg-background relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <Image src="/Genie.png" alt="Lattice OS logo" fill className="object-cover" sizes="(max-width: 768px) 32px, 32px" />
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-foreground font-heading">Lattice OS</span>
            </div>

            <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
              <Link href="/slack" className="hover:text-foreground transition-colors">Slack Integration</Link>
              <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            </div>

            <div className="flex gap-4" />
          </div>

          <div className="pt-8 border-t border-border text-center">
            <p className="text-muted-foreground text-sm">
              {t("footer.rights", { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
