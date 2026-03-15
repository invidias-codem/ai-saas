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
import { FeatureCard } from "@/components/landing/feature-card";
import { Testimonials } from "@/components/landing/testimonials";
import { useTranslations } from "next-intl";

const LandingPage = () => {
  const t = useTranslations("Landing");

  const features = [
    {
      label: t('features.conversation'),
      icon: ChatBubbleIcon,
      description: t('features.conversationDesc'),
      color: "text-sky-500",
      bgColor: "bg-sky-500/10",
    },
    {
      label: t('features.image'),
      icon: ImageIcon,
      description: t('features.imageDesc'),
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      label: t('features.video'),
      icon: VideoIcon,
      description: t('features.videoDesc'),
      color: "text-pink-600",
      bgColor: "bg-pink-600/10",
    },
    {
      label: t('features.music'),
      icon: DiscIcon,
      description: t('features.musicDesc'),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      label: t('features.code'),
      icon: CodeIcon,
      description: t('features.codeDesc'),
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: t('features.fast'),
      icon: RocketIcon,
      description: t('features.fastDesc'),
      color: "text-indigo-500 dark:text-white",
      bgColor: "bg-indigo-500/10 dark:bg-white/10",
    },
  ];

  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative selection:bg-purple-500/30 selection:text-white dark:selection:text-white">

      <main className="relative z-10 flex-grow pt-16">

        {/* 1 — Hero: "forgotten. not anymore." */}
        <HeroSection />

        {/* 2 — UCOL: Three minds. One answer. */}
        <UCOLSection />

        {/* 3 — Memory: Genie learns you. */}
        <MemorySection />

        {/* 4 — Features Grid: One platform. Every capability. */}
        <section className="px-4 py-32 max-w-7xl mx-auto relative cursor-default">
          {/* Ambient glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-violet-500/5 dark:bg-indigo-500/10 rounded-full blur-[100px] -z-10" />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-slate-800 dark:text-white mb-6 font-heading">
              {t('features.title')}
            </h2>
            <p className="text-slate-500 dark:text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('features.subtitle')}
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

        {/* 5 — CTA: Meet the AI that remembers. */}
        <section className="py-32 text-center px-4 relative overflow-hidden">
          {/* Background: indigo-950 → violet-950 gradient with soft glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-violet-950 to-indigo-950 pointer-events-none" />
          {/* Soft center glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-violet-500/20 rounded-full blur-[100px] pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-3xl mx-auto relative z-10 space-y-8"
          >
            <h2
              className="font-bold text-white font-heading tracking-tight"
              style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}
            >
              {t('cta.title')}
            </h2>
            <p className="text-xl text-slate-300/80">
              {t('cta.subtitle')}
            </p>
            <Link href="/dashboard">
              <Button
                size="lg"
                className="rounded-full px-12 py-8 text-lg mt-4 bg-white text-violet-900 font-bold hover:bg-white/90 shadow-[0_0_60px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_80px_-10px_rgba(255,255,255,0.45)] transition-all duration-300"
              >
                {t('cta.button')}
              </Button>
            </Link>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-200 dark:border-white/10 bg-background relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" sizes="(max-width: 768px) 32px, 32px" />
              </div>
              <span className="text-xl font-bold text-slate-800 dark:text-foreground font-heading">Genie AI</span>
            </div>

            <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-400 dark:text-muted-foreground">
              <Link href="/blog" className="hover:text-slate-700 dark:hover:text-white transition-colors">Blog</Link>
              <Link href="/slack" className="hover:text-slate-700 dark:hover:text-white transition-colors">Slack Integration</Link>
              <Link href="/support" className="hover:text-slate-700 dark:hover:text-white transition-colors">Support</Link>
              <Link href="/privacy" className="hover:text-slate-700 dark:hover:text-white transition-colors">Privacy Policy</Link>
            </div>

            <div className="flex gap-4">
              {/* Social icons placeholder */}
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 dark:border-white/5 text-center">
            <p className="text-slate-400 dark:text-gray-500 text-sm">
              {t('footer.rights', { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default LandingPage;
