"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useProModal } from "@/hooks/use-pro-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const DashboardSupport = () => {
    const t = useTranslations("DashboardSupport");
    const proModal = useProModal();

    return (
        <Card className="bg-gradient-to-br from-[#1c2333] to-[#111827] border-indigo-500/20 shadow-lg mb-8">
            <CardHeader className="pb-2 pt-6 px-6">
                <CardTitle className="flex items-center gap-x-2 text-lg font-bold text-white">
                    <Heart className="w-5 h-5 text-pink-500 fill-pink-500 animate-pulse" />
                    {t('title')}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
                <div className="space-y-4 text-sm text-zinc-300 leading-relaxed max-w-4xl">
                    <p>{t('p1')}</p>
                    <p>{t('p2')}</p>
                    <p>{t('p3')}</p>
                    <Button
                        onClick={proModal.onOpen}
                        variant="premium"
                        className="text-sm font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 border-0 mt-2"
                    >
                        {t('button')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
