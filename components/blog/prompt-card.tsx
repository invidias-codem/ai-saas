"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Code,
  FileText,
  BarChart,
  Briefcase,
  Palette
} from "lucide-react";
import Link from "next/link";

type PromptCategory = "content" | "coding" | "analysis" | "business" | "creative";
type Difficulty = "beginner" | "intermediate" | "advanced";

interface PromptCardProps {
  number: number;
  title: string;
  category: PromptCategory;
  difficulty: Difficulty;
  prompt: string;
  example?: string;
  tips?: string[];
  children?: React.ReactNode;
}

const categoryConfig: Record<PromptCategory, {
  icon: typeof FileText;
  color: string;
  bgColor: string;
  label: string;
}> = {
  content: {
    icon: FileText,
    color: "text-accent-foreground",
    bgColor: "bg-accent",
    label: "Content",
  },
  coding: {
    icon: Code,
    color: "text-primary",
    bgColor: "bg-accent",
    label: "Coding",
  },
  analysis: {
    icon: BarChart,
    color: "text-primary",
    bgColor: "bg-accent",
    label: "Analysis",
  },
  business: {
    icon: Briefcase,
    color: "text-accent-foreground",
    bgColor: "bg-accent",
    label: "Business",
  },
  creative: {
    icon: Palette,
    color: "text-accent-foreground",
    bgColor: "bg-accent",
    label: "Creative",
  },
};

const difficultyConfig: Record<Difficulty, {
  color: string;
  bgColor: string;
  label: string;
}> = {
  beginner: {
    color: "text-primary",
    bgColor: "bg-accent",
    label: "Beginner",
  },
  intermediate: {
    color: "text-warning",
    bgColor: "bg-warning-surface",
    label: "Intermediate",
  },
  advanced: {
    color: "text-destructive",
    bgColor: "bg-danger-surface",
    label: "Advanced",
  },
};

export function PromptCard({
  number,
  title,
  category,
  difficulty,
  prompt,
  example,
  tips,
  children,
}: PromptCardProps) {
  const [copied, setCopied] = useState(false);
  const [showExample, setShowExample] = useState(false);

  const catConfig = categoryConfig[category];
  const diffConfig = difficultyConfig[difficulty];
  const CategoryIcon = catConfig.icon;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div 
      id={`prompt-${number}`}
      className="my-8 rounded-xl border border-border bg-card overflow-hidden scroll-mt-24 shadow-sm dark:shadow-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-chrome border-b border-border">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-accent-foreground font-bold text-sm">
            {number}
          </span>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <span className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            catConfig.bgColor,
            catConfig.color
          )}>
            <CategoryIcon className="w-3 h-3" />
            {catConfig.label}
          </span>
          
          <span className={cn(
            "px-2.5 py-1 rounded-full text-xs font-medium",
            diffConfig.bgColor,
            diffConfig.color
          )}>
            {diffConfig.label}
          </span>
        </div>
      </div>

      <div className="p-4">
        <div className="relative">
          <div className="p-4 rounded-lg bg-chrome font-mono text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {prompt}
          </div>
          
          <button
            onClick={handleCopy}
            className={cn(
              "absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition duration-200",
              copied
                ? "bg-green-500/20 text-primary"
                : "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
            )}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Prompt
              </>
            )}
          </button>
        </div>

        {children && (
          <div className="mt-4 text-muted-foreground text-sm">
            {children}
          </div>
        )}

        {tips && tips.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-accent border border-border">
            <p className="text-accent-foreground text-sm font-medium mb-2">💡 Pro Tips:</p>
            <ul className="space-y-1">
              {tips.map((tip, index) => (
                <li key={index} className="text-muted-foreground text-sm flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {example && (
          <div className="mt-4">
            <button
              onClick={() => setShowExample(!showExample)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {showExample ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {showExample ? "Hide Example" : "Show Example Output"}
            </button>
            
            {showExample && (
              <div className="mt-3 p-4 rounded-lg bg-chrome border border-border">
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Example Output:</p>
                <div className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {example}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Try this prompt with Genie AI
          </p>
          <Link
            href="/sign-up"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-action text-action-foreground hover:bg-action-hover text-sm font-medium transition duration-200"
          >
            <Sparkles className="w-4 h-4" />
            Try in Genie
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PromptNavigation() {
  const categories = Object.entries(categoryConfig);

  return (
    <div className="my-8 p-4 rounded-xl border border-border bg-card shadow-sm dark:shadow-none">
      <p className="text-sm text-muted-foreground mb-3">Jump to category:</p>
      <div className="flex flex-wrap gap-2">
        {categories.map(([key, config]) => {
          const Icon = config.icon;
          return (
            <a
              key={key}
              href={`#${key}-prompts`}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                config.bgColor,
                config.color,
                "hover:opacity-80"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {config.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
