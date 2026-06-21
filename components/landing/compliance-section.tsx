'use client';

import { motion } from 'framer-motion';
import { Shield, Lock, FileCheck, Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function ComplianceSection() {
  const t = useTranslations('Landing.compliance');

  const frameworks = [
    {
      icon: Shield,
      title: t('gdprTitle'),
      body: t('gdprBody'),
    },
    {
      icon: Lock,
      title: t('hipaaTitle'),
      body: t('hipaaBody'),
    },
    {
      icon: Building2,
      title: t('doraTitle'),
      body: t('doraBody'),
    },
    {
      icon: FileCheck,
      title: t('soc2Title'),
      body: t('soc2Body'),
    },
  ];

  return (
    <section className="py-20 sm:py-32 bg-gradient-to-b from-background to-background/80">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-600 mb-3">
            {t('eyebrow')}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            {t('title')}
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            {t('subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {frameworks.map((framework, idx) => (
            <motion.div
              key={framework.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative bg-card border border-border rounded-2xl p-8 hover:border-primary-500/30 transition-colors duration-300">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center">
                    <framework.icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-foreground mb-3">
                      {framework.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {framework.body}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
