"use client";

import React from "react";
import { Zap, Brain, Bot } from "lucide-react";
import { useCodeModel } from "@/contexts/CodeModelContext";
import { CODE_MODELS } from "@/lib/llm/codeModels";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const MODE_ICONS = {
    fast: Zap,
    quality: Brain,
    agentic: Bot,
};

const MODE_COLORS = {
    fast: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300',
    quality: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
    agentic: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300',
};

export function CodeModelToggle({ disabled }: { disabled?: boolean }) {
    const { codeModel, setCodeModel } = useCodeModel();

    return (
        <TooltipProvider>
            <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border gap-1">
                {Object.entries(CODE_MODELS).map(([key, config]) => {
                    const Icon = MODE_ICONS[key as keyof typeof MODE_ICONS];
                    const isActive = codeModel === key;

                    return (
                        <Tooltip key={key}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setCodeModel(key as any)}
                                    disabled={disabled}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5",
                                        isActive
                                            ? `${MODE_COLORS[key as keyof typeof MODE_COLORS]} border shadow-sm`
                                            : "text-muted-foreground hover:text-foreground",
                                        disabled && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {config.name}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p className="font-semibold">{config.name}</p>
                                <p className="text-xs text-muted-foreground">{config.description}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </TooltipProvider>
    );
}
