"use client";

import { useCredits } from "@/hooks/use-credits";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { useProModal } from "@/hooks/use-pro-modal";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export const CreditDisplay = () => {
    const { credits, isLoading } = useCredits();
    const proModal = useProModal();

    // Warn if low credits (below 10)
    const isLow = credits < 10;

    if (isLoading) return <div className="text-muted-foreground text-xs animate-pulse">Loading...</div>;

    return (
        <div className="flex items-center gap-x-2">
            <div className={cn(
                "flex items-center gap-x-1 px-3 py-1 rounded-full border bg-background",
                isLow ? "border-red-500 text-red-500 bg-red-500/10" : "border-slate-200 dark:border-slate-700"
            )}>
                <Zap className="w-3 h-3 fill-current" />
                <span className="font-bold text-sm">
                    {credits}
                </span>
                <span className="text-xs ml-1 opacity-70">credits</span>
            </div>
            <Button onClick={proModal.onOpen} variant="outline" size="sm" className="h-8 text-xs">
                Top up
            </Button>
        </div>
    );
};
