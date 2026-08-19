"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export const ConversionFooter = () => {
  const t = useTranslations("Landing.expertV2.footer");

  return (
    <section className="relative border-t border-white/10 bg-white/[0.02]">
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto"
        >
          <h2 className="font-heading font-bold tracking-tight text-3xl md:text-5xl mb-6">
            {t("title")}
          </h2>
          <p className="text-white/60 text-lg max-w-xl mx-auto mb-10">
            {t("body")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/onboarding">
              <Button
                size="lg"
                className="bg-white text-black hover:bg-white/90 rounded-full px-8 py-4 md:py-6 min-h-[48px] text-base font-semibold active:scale-95 transition-transform"
              >
                {t("cta")}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/support">
              <Button
                variant="outline"
                size="lg"
                className="border-white/20 text-white hover:bg-white/10 rounded-full px-8 py-4 md:py-6 min-h-[48px] text-base backdrop-blur-sm active:scale-95 transition-transform"
              >
                {t("secondaryCta")}
              </Button>
            </Link>
          </div>
          <p className="text-white/40 text-sm mt-6">
            {t("microcopy")}
          </p>
        </motion.div>
      </div>
    </section>
  );
};
