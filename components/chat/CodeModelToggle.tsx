"use client";

import React from "react";
import { Zap, Brain, Bot, Lightbulb, ChevronDown } from "lucide-react";
import { useCodeModel } from "@/contexts/CodeModelContext";
import { CODE_MODELS } from "@/lib/llm/codeModels";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MODE_ICONS = {
    fast: Zap,
    quality: Brain,
    agentic: Bot,
    reasoning: Lightbulb,
};

const MODE_COLORS = {
    fast: 'text-green-600 dark:text-green-400',
    quality: 'text-purple-600 dark:text-purple-400',
    agentic: 'text-indigo-600 dark:text-indigo-400',
    reasoning: 'text-amber-600 dark:text-amber-400',
};

export function CodeModelToggle({ disabled }: { disabled?: boolean }) {
    const { codeModel, setCodeModel } = useCodeModel();
    const activeConfig = CODE_MODELS[codeModel] || CODE_MODELS.fast;
    const ActiveIcon = MODE_ICONS[codeModel as keyof typeof MODE_ICONS] || Zap;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger disabled={disabled} className="outline-none" asChild>
                <button className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-[20px] text-sm font-medium transition-colors border border-border bg-background hover:bg-muted focus:bg-muted",
                    disabled && "opacity-50 cursor-not-allowed",
                    MODE_COLORS[codeModel as keyof typeof MODE_COLORS]
                )}>
                    <ActiveIcon className="w-4 h-4" />
                    <span>{activeConfig.name}</span>
                    <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-50" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-[220px] mb-2 p-1 border-border/50 shadow-lg rounded-xl">
                {Object.entries(CODE_MODELS).map(([key, config]) => {
                    const Icon = MODE_ICONS[key as keyof typeof MODE_ICONS];
                    const isActive = codeModel === key;

                    return (
                        <DropdownMenuItem
                            key={key}
                            onClick={() => setCodeModel(key as any)}
                            className={cn(
                                "flex items-start gap-3 p-2.5 cursor-pointer rounded-lg mb-1 last:mb-0 transition-colors",
                                isActive ? "bg-muted" : "hover:bg-muted/50"
                            )}
                        >
                            <div className="flex-shrink-0 mt-0.5">
                                <Icon className={cn("w-4 h-4", MODE_COLORS[key as keyof typeof MODE_COLORS])} />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-[13px]">{config.name}</span>
                                <span className="text-[11px] leading-tight text-muted-foreground">{config.description}</span>
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
