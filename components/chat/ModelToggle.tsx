"use client";

import React from "react";
import { Sparkles } from "lucide-react"; // assuming lucide-react is used in project
import { useModel } from "@/contexts/ModelContext";
import { cn } from "@/lib/utils"; // assuming standard shadcn/ui generic utils exists
// If cn is not available, I will use clsx or simple string concat
// Just in case, I'll assume cn exists as it's common in shadcn/ui projects which this likely is

export function ModelToggle({ disabled }: { disabled?: boolean }) {
    const { agentMode, setAgentMode } = useModel();

    return (
        <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border gap-1">
            <button
                onClick={() => setAgentMode("standard")}
                disabled={disabled}
                className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    agentMode === "standard"
                        ? "bg-background text-foreground shadow-sm dark:bg-zinc-800"
                        : "text-muted-foreground hover:text-foreground",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
                title="Gemini 2.0 Flash: Fastest response time"
            >
                Fast
            </button>

            <button
                onClick={() => setAgentMode("quality")}
                disabled={disabled}
                className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    agentMode === "quality"
                        ? "bg-purple-100 text-purple-700 border border-purple-200 shadow-sm dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
                        : "text-muted-foreground hover:text-foreground",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
                title="Claude 3.5 Sonnet: Best reasoning and code quality"
            >
                Quality
            </button>

            <button
                onClick={() => setAgentMode("agentic-preview")}
                disabled={disabled}
                className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5",
                    agentMode === "agentic-preview"
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                        : "text-muted-foreground hover:text-foreground",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
                title="Agentic Mode uses Gemini 1.5 Pro to actively reason, research, and plan."
            >
                <Sparkles className="w-3.5 h-3.5" />
                Agentic
            </button>
        </div>
    );
}
