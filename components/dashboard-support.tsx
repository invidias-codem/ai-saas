"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { KoFiWidget } from "@/components/kofi-widget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const DashboardSupport = () => {
    const t = useTranslations("DashboardSupport");


    return (
        <Card className="bg-card border-border shadow-lg mb-8">
            <CardHeader className="pb-2 pt-6 px-6">
                <CardTitle className="flex items-center gap-x-2 text-lg font-bold text-foreground">
                    <Heart className="w-5 h-5 text-pink-500 fill-pink-500 animate-pulse" />
                    {t('title')}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed max-w-4xl">
                    <p>{t('p1')}</p>
                    <p>{t('p2')}</p>
                    <p>{t('p3')}</p>
                    <div className="mt-6 w-full max-w-2xl">
                        <KoFiWidget />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
