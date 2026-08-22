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
            {/* Credit pill — hidden on mobile, visible sm+ */}
            <div className={cn(
                "hidden sm:flex items-center gap-x-1 px-3 py-1 rounded-full border bg-background",
                isLow ? "border-red-500 text-red-500 bg-red-500/10" : "border-slate-200 dark:border-slate-700"
            )}>
                <Zap className="w-3 h-3 fill-current" />
                <span className="font-bold text-sm">{credits}</span>
                <span className="text-xs ml-1 opacity-70">credits</span>
            </div>
            
            {/* Golden ratio top-up button — always visible */}
            <Button
                asChild
                variant="outline"
                size="sm"
                className="golden-btn h-8 w-8 sm:w-auto sm:px-4 p-0 sm:p-2"
            >
                <a
                    href={paypalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full h-full"
                    aria-label="Top up credits"
                >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span className="hidden sm:inline text-xs font-medium">Top up</span>
                </a>
            </Button>
        </div>
    );
};
