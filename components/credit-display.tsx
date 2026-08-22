"use client";

import { useCredits } from "@/hooks/use-credits";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const CreditDisplay = () => {
    const { credits, isLoading } = useCredits();
    const isLow = credits < 10;

    if (isLoading) return <div className="text-muted-foreground text-xs animate-pulse">Loading...</div>;

    const paypalUrl = process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL || "https://ko-fi.com/joshuajair/?hidefeed=true&widget=true&embed=true&preview=true";

    return (
        <div className="flex items-center gap-x-1.5 sm:gap-x-2">
            {/* Credit pill — compact on mobile */}
            <div className={cn(
                "flex items-center gap-x-1 px-2 sm:px-3 py-1 rounded-full border bg-background",
                isLow ? "border-red-500 text-red-500 bg-red-500/10" : "border-slate-200 dark:border-slate-700"
            )}>
                <Zap className="w-3 h-3 fill-current" />
                <span className="font-bold text-xs sm:text-sm">{credits}</span>
                <span className="text-[10px] sm:text-xs ml-0.5 opacity-70 hidden xs:inline">credits</span>
            </div>
            
            {/* Golden ratio top-up button */}
            <Button
                asChild
                variant="outline"
                size="sm"
                className="golden-btn h-8 px-3 sm:px-4"
            >
                <a
                    href={paypalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5"
                    aria-label="Top up credits"
                >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span className="hidden sm:inline text-xs font-medium">Top up</span>
                </a>
            </Button>
        </div>
    );
};
