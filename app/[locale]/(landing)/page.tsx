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
import { HeroSection } from "@/components/landing/hero-section";
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

        <HeroSection />

        {/* Features Grid */}
        <section className="px-4 py-32 max-w-7xl mx-auto relative cursor-default">
          {/* Soft ambient glow — works on both modes */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-violet-500/5 dark:bg-indigo-500/10 rounded-full blur-[100px] -z-10" />

          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-slate-800 dark:text-white mb-6 font-heading">
              {t('features.title')}
            </h2>
            <p className="text-slate-500 dark:text-muted-foreground text-lg max-w-2xl mx-auto">
              {t('features.subtitle')}
            </p>
          </div>

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

        {/* Bottom CTA */}
        <section className="py-24 text-center px-4 relative overflow-hidden">
          {/* Light: soft violet wash from below; Dark: purple fog */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-violet-100/60 dark:to-purple-900/20 pointer-events-none" />
          <div className="max-w-3xl mx-auto relative z-10 space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-800 dark:text-white font-heading tracking-tight">
              {t('cta.title')}
            </h2>
            <p className="text-xl text-slate-500 dark:text-muted-foreground">
              {t('cta.subtitle')}
            </p>
            <Link href="/dashboard">
              <Button
                size="lg"
                className="rounded-full px-10 py-8 text-lg mt-4 bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-white dark:to-white text-white dark:text-black hover:opacity-90 dark:hover:bg-gray-200 shadow-[0_0_40px_-10px_rgba(139,92,246,0.4)] dark:shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
              >
                {t('cta.button')}
              </Button>
            </Link>
          </div>
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
