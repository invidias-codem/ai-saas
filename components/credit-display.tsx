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
                "hidden items-center gap-x-1 rounded-full border px-3 py-1 sm:flex",
                isLow ? "border-warning/30 bg-warning-surface text-warning" : "border-border bg-card"
            )}>
                <Zap className="w-3 h-3 fill-current" />
                <span className="font-bold text-sm">{credits}</span>
                <span className="ml-1 text-xs">credits</span>
            </div>
            
            {/* Compact on mobile */}
            <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 border-border bg-card p-0 sm:w-auto sm:px-3"
            >
                <a
                    href={paypalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full h-full"
                    aria-label="Top up credits"
                >
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline text-xs font-medium">Top up</span>
                </a>
            </Button>
        </div>
    );
};
