"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { ArrowRightIcon, ShieldCheckIcon, ActivityIcon, DatabaseIcon, TerminalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RosterGrid } from '@/components/marketing/RosterGrid';
import { usePricingModal } from '@/lib/store/pricing-modal-store';

const MECHANICS_ITEMS = [
  {
    icon: ShieldCheckIcon,
    translationKey: 'mechanics.item1',
  },
  {
    icon: DatabaseIcon,
    translationKey: 'mechanics.item2',
  },
  {
    icon: ActivityIcon,
    translationKey: 'mechanics.item3',
  },
  {
    icon: TerminalIcon,
    translationKey: 'mechanics.item4',
  },
];

export default function ExpertLandingPage() {
  const t = useTranslations('Landing.expert');
  const { open: openPricingModal } = usePricingModal();

  return (
    <div className="relative min-h-screen bg-[#050505] text-white overflow-hidden">
      {/* Animated gradient orbs for depth */}
      <div className="absolute top-[-20%] left-[-10%] h-[800px] w-[800px] rounded-full bg-gradient-to-br from-purple-600/20 via-violet-500/10 to-transparent blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-5%] h-[600px] w-[600px] rounded-full bg-gradient-to-tl from-blue-500/15 via-cyan-400/10 to-transparent blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[40%] left-[60%] h-[400px] w-[400px] rounded-full bg-gradient-to-br from-pink-500/10 via-rose-400/5 to-transparent blur-[80px] pointer-events-none animate-pulse" style={{ animationDelay: '4s' }} />

      {/* Subtle grid overlay for texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      {/* Noise texture overlay for premium feel */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none mix-blend-overlay" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }} />

      <div className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pt-24 pb-20 md:pt-28 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl"
          >
            <span className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/70 mb-8">
              {t('badge')}
            </span>

            <h1 className="font-heading font-bold tracking-tight leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.8rem, 7vw, 5.5rem)' }}>
              {t('headline1')}
              <br />
              <span className="text-white/50">{t('headline2')}</span>
            </h1>

            <p className="text-white/60 text-lg md:text-xl leading-relaxed max-w-2xl mb-10">
              {t('subhead')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/onboarding">
                <Button size="lg" className="bg-white text-black hover:bg-white/90 rounded-full px-8 py-6 text-base font-semibold">
                  {t('ctaHeroPrimary')}
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#mechanics">
                <Button variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10 rounded-full px-8 py-6 text-base backdrop-blur-sm">
                  {t('ctaSecondary')}
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Roster */}
        <RosterGrid />

        {/* Mechanics / Moat */}
        <section id="mechanics" className="border-t border-white/10 bg-white/[0.02]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="mb-16"
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4 block">
                {t('mechanics.eyebrow')}
              </span>
              <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-4">
                {t('mechanics.title')}
              </h2>
              <p className="text-white/60 text-lg max-w-2xl">
                {t('mechanics.subtitle')}
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {MECHANICS_ITEMS.map((item, i) => (
                <motion.div
                  key={item.translationKey}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="group relative rounded-2xl border border-white/10 bg-white/[0.03] p-8 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300"
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <div className="w-10 h-10 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center mb-5">
                      <item.icon className="h-5 w-5 text-white/80" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 font-heading">{t(`${item.translationKey}Title`)}</h3>
                    <p className="text-white/60 text-sm leading-relaxed">{t(`${item.translationKey}Body`)}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-6">
                {t('cta.title')}
              </h2>
              <p className="text-white/60 text-lg max-w-xl mx-auto mb-10">
                {t('cta.subtitle')}
              </p>
              <Link href="/onboarding">
                <Button size="lg" className="bg-white text-black hover:bg-white/90 rounded-full px-10 py-6 text-lg font-semibold">
                  {t('cta.ctaFooterPrimary')}
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 py-8">
          <div className="mx-auto max-w-7xl px-6 flex items-center justify-between text-xs text-white/40">
            <span>© {new Date().getFullYear()} Lattice OS. All rights reserved.</span>
            <span>{t('badge')}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
