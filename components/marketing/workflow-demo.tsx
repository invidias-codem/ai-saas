"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

export const WorkflowDemo = () => {
  const t = useTranslations("Landing.expertV2.workflow");
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { titleKey: "step1Title", descKey: "step1Desc" },
    { titleKey: "step2Title", descKey: "step2Desc" },
    { titleKey: "step3Title", descKey: "step3Desc" },
    { titleKey: "step4Title", descKey: "step4Desc" },
  ] as const;

  return (
    <section id="how-it-works" className="relative">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
        {/* Header */}
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
        </motion.div>

        {/* Interactive Demo Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Simulated Chat Window */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-7"
          >
            <div className="rounded-2xl border border-white/10 bg-[#0a0a0f]/90 backdrop-blur-xl overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-white/[0.03]">
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <span className="ml-3 text-xs text-white/40 font-mono">
                  workspace-expert
                </span>
              </div>

              {/* Chat content */}
              <div className="p-5 md:p-6 space-y-4 min-h-[300px]">
                {/* User prompt — always visible */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white/10 px-4 py-2.5 text-sm text-white/90">
                    {t("prompt")}
                  </div>
                </div>

                {/* Animated step response */}
                <div className="flex justify-start">
                  <div className="max-w-[90%] w-full">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-[8px] font-bold">
                        AI
                      </div>
                      <span className="text-xs text-white/40">Expert</span>
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeStep}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.3 }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="text-sm font-semibold text-white mb-2">
                          {t(steps[activeStep].titleKey)}
                        </div>
                        <p className="text-sm text-white/60 leading-relaxed">
                          {t(steps[activeStep].descKey)}
                        </p>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right: Step Triggers */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-5"
          >
            <div className="space-y-3">
              {steps.map((step, i) => (
                <button
                  key={step.titleKey}
                  onClick={() => setActiveStep(i)}
                  className={`w-full text-left rounded-xl border p-5 min-h-[48px] transition duration-200 ${
                    activeStep === i
                      ? "border-purple-500/40 bg-purple-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        activeStep === i
                          ? "bg-purple-500 text-white"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        activeStep === i ? "text-white" : "text-white/70"
                      }`}
                    >
                      {t(step.titleKey)}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed pl-9">
                    {t(step.descKey)}
                  </p>
                </button>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-8">
              <button className="text-sm font-semibold text-white/80 hover:text-white min-h-[48px] transition underline underline-offset-4">
                Try a sample prompt
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
