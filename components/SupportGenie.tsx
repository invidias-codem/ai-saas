"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import Link from "next/link";
import { KoFiWidget } from "@/components/kofi-widget";
import { useTranslations } from "next-intl";

interface SupportGenieProps {
    onSuccess?: () => void;
}

export const SupportGenie = ({ onSuccess }: SupportGenieProps) => {
    const t = useTranslations("SupportGenie");

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="text-center space-y-2 flex-none">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500">
                    {t('title')}
                </h2>
                <p className="text-muted-foreground text-sm">
                    {t('description')}
                </p>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ⚠️ {t('important')}
                </div>
                <p className="text-xs text-muted-foreground">
                    {t('creditRate')}
                </p>
            </div>

            {/* Donation Widget */}
            <div className="flex-1 w-full">
                <KoFiWidget />
            </div>

            {/* Manual Fallback */}
            <div className="text-center pt-2 border-t text-xs text-muted-foreground flex-none">
                <p>{t('donatedWithDifferentEmail')} <Link href="/support" className="underline hover:text-primary">{t('contactSupport')}</Link></p>
            </div>
        </div>
    );
};
