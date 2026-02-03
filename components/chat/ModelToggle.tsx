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
        <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border">
            <button
                onClick={() => setAgentMode("standard")}
                disabled={disabled}
                className={cn(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    agentMode === "standard"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                Flash 2.0 (Fast)
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
                title="Agentic Mode uses Gemini 3 to actively reason and execute code. It is slower and costs more."
            >
                <Sparkles className="w-3.5 h-3.5" />
                Agentic
                <span className="text-[10px] bg-indigo-600 text-white px-1 rounded ml-0.5 font-bold">
                    BETA
                </span>
            </button>
        </div>
    );
}
