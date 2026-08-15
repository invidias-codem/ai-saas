"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import Link from "next/link";
import { KoFiWidget } from "@/components/kofi-widget";
import { PayPalButton } from "@/components/paypal-button";
import { useTranslations } from "next-intl";
import { PACKS } from "@/lib/subscription/packs";

interface SupportGenieProps {
    onSuccess?: () => void;
}

export const SupportGenie = ({ onSuccess }: SupportGenieProps) => {
    const t = useTranslations("SupportGenie");
    const KOFI_PAGE = process.env.NEXT_PUBLIC_KOFI_PAGE || "joshuajair";

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

            {/* Fixed credit packs — informational; payment via the widget below */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-none">
                {PACKS.map((pack) => (
                    <div
                        key={pack.id}
                        className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-4 text-center"
                    >
                        <div className="font-bold text-foreground">{pack.name}</div>
                        <div className="text-lg font-extrabold text-pink-500">${pack.priceUsd}</div>
                        <div className="text-xs text-muted-foreground">{pack.credits.toLocaleString()} credits</div>
                        <div className="text-[11px] text-muted-foreground mt-1">{pack.blurb}</div>
                    </div>
                ))}
            </div>

            {/* Donation Widget (free-form / tips) */}
            <div className="flex-1 w-full">
                <PayPalButton />
                <KoFiWidget />
            </div>

            {/* Manual Fallback */}
            <div className="text-center pt-2 border-t text-xs text-muted-foreground flex-none">
                <p>{t('donatedWithDifferentEmail')} <Link href="/support" className="underline hover:text-primary">{t('contactSupport')}</Link></p>
            </div>
        </div>
    );
};
