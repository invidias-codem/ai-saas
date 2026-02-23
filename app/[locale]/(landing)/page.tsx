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
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      label: t('features.video'),
      icon: VideoIcon,
      description: t('features.videoDesc'),
      color: "text-pink-700",
      bgColor: "bg-pink-700/10",
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
      color: "text-green-400",
      bgColor: "bg-green-500/10",
    },
    {
      label: t('features.fast'),
      icon: RocketIcon,
      description: t('features.fastDesc'),
      color: "text-white",
      bgColor: "bg-white/10",
    },
  ];

  const pricingTiers = [
    {
      name: t('pricing.payAsYouGo'),
      price: "$0.10",
      unit: "per video",
      description: t('pricing.subtitle'),
      features: ["No monthly subscription", "Access to all models", "Standard generation speed"],
      popular: false,
    },
    {
      name: t('pricing.creatorBundle'),
      price: "$1.00",
      unit: "per 10 videos",
      description: t('pricing.subtitle'),
      features: ["10 Credits included", "Priority support", "High-res downloads"],
      popular: true,
    },
    {
      name: t('pricing.proStudio'),
      price: "$9.00",
      unit: "per 100 videos",
      description: t('pricing.subtitle'),
      features: ["100 Credits included", "Fastest generation speed", "Commercial usage rights"],
      popular: false,
    },
  ];

  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative selection:bg-purple-500/30 selection:text-white">

      <main className="relative z-10 flex-grow pt-16">

        <HeroSection />

        {/* Features Grid */}
        <section className="px-4 py-32 max-w-7xl mx-auto relative cursor-default">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] -z-10" />

          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 font-heading">{t('features.title')}</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
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
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-purple-900/20 pointer-events-none" />
          <div className="max-w-3xl mx-auto relative z-10 space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-white font-heading tracking-tight">
              {t('cta.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('cta.subtitle')}
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="rounded-full px-10 py-8 text-lg bg-white text-black hover:bg-gray-200 mt-4 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
                {t('cta.button')}
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10 bg-background relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" sizes="(max-width: 768px) 32px, 32px" />
              </div>
              <span className="text-xl font-bold text-foreground font-heading">Genie AI</span>
            </div>

            <div className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              <Link href="/blog" className="hover:text-foreground dark:hover:text-white transition-colors">Blog</Link>
              <Link href="/slack" className="hover:text-foreground dark:hover:text-white transition-colors">Slack Integration</Link>
              <Link href="/support" className="hover:text-foreground dark:hover:text-white transition-colors">Support</Link>
              <Link href="/privacy" className="hover:text-foreground dark:hover:text-white transition-colors">Privacy Policy</Link>
            </div>

            <div className="flex gap-4">
              {/* Social icons placeholder */}
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 text-center">
            <p className="text-gray-500 text-sm">
              {t('footer.rights', { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default LandingPage;
