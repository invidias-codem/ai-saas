"use client";

import React from "react";
import { Zap, Brain, Sparkles } from "lucide-react";
import { useModel } from "@/contexts/ModelContext";
import { cn } from "@/lib/utils";

/**
 * UCOL Model Toggle — Three conversation modes
 *
 * ⚡ Fast      Hermes3 (local) — instant responses, zero API cost
 * 🧠 Quality   Gemini Pro — deep reasoning, analysis, memory-aware
 * ✨ Agentic   Claude — autonomous tools: web search, research papers, creative writing
 */

const MODES = [
  {
    id: "fast" as const,
    label: "Fast",
    icon: Zap,
    tooltip: "Hermes3 — Instant responses. Best for quick questions and back-and-forth conversation.",
    activeClass:
      "bg-background text-foreground shadow-sm dark:bg-zinc-800 dark:text-white",
    iconClass: "text-yellow-500",
  },
  {
    id: "quality" as const,
    label: "Quality",
    icon: Brain,
    tooltip: "Gemini Pro — Deep reasoning, structured analysis, and full memory context. Best for complex questions.",
    activeClass:
      "bg-purple-100 text-purple-700 border border-purple-200 shadow-sm dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
    iconClass: "text-purple-500 dark:text-purple-400",
  },
  {
    id: "agentic" as const,
    label: "Agentic",
    icon: Sparkles,
    tooltip: "Claude — Autonomous agent. Searches the web, writes research papers, creates stories, and completes multi-step tasks.",
    activeClass:
      "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
    iconClass: "text-indigo-500 dark:text-indigo-400",
  },
] as const;

export function ModelToggle({ disabled }: { disabled?: boolean }) {
  const { agentMode, setAgentMode } = useModel();

  return (
    <div className="flex items-center p-1 bg-muted/50 rounded-lg border border-border gap-1">
      {MODES.map(({ id, label, icon: Icon, tooltip, activeClass, iconClass }) => {
        const isActive = agentMode === id;
        return (
          <button
            key={id}
            onClick={() => setAgentMode(id)}
            disabled={disabled}
            title={tooltip}
            aria-pressed={isActive}
            aria-label={`${label} mode: ${tooltip}`}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5",
              isActive ? activeClass : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Icon
              className={cn(
                "w-3.5 h-3.5 transition-colors",
                isActive ? iconClass : "text-muted-foreground"
              )}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
