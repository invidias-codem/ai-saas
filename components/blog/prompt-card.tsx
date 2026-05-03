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
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    label: "Content",
  },
  coding: {
    icon: Code,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    label: "Coding",
  },
  analysis: {
    icon: BarChart,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-500/10",
    label: "Analysis",
  },
  business: {
    icon: Briefcase,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/10",
    label: "Business",
  },
  creative: {
    icon: Palette,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-500/10",
    label: "Creative",
  },
};

const difficultyConfig: Record<Difficulty, {
  color: string;
  bgColor: string;
  label: string;
}> = {
  beginner: {
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/20",
    label: "Beginner",
  },
  intermediate: {
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/20",
    label: "Intermediate",
  },
  advanced: {
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/20",
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
      className="my-8 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 overflow-hidden scroll-mt-24 shadow-sm dark:shadow-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold text-sm">
            {number}
          </span>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
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
          <div className="p-4 rounded-lg bg-slate-950 font-mono text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
            {prompt}
          </div>
          
          <button
            onClick={handleCopy}
            className={cn(
              "absolute top-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              copied
                ? "bg-green-500/20 text-green-600 dark:text-green-400"
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
          <div className="mt-4 text-slate-600 dark:text-gray-400 text-sm">
            {children}
          </div>
        )}

        {tips && tips.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <p className="text-purple-700 dark:text-purple-300 text-sm font-medium mb-2">💡 Pro Tips:</p>
            <ul className="space-y-1">
              {tips.map((tip, index) => (
                <li key={index} className="text-slate-600 dark:text-gray-400 text-sm flex items-start gap-2">
                  <span className="text-purple-600 dark:text-purple-400">•</span>
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
              className="flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              {showExample ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              {showExample ? "Hide Example" : "Show Example Output"}
            </button>
            
            {showExample && (
              <div className="mt-3 p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <p className="text-xs text-slate-500 dark:text-gray-500 mb-2 uppercase tracking-wide">Example Output:</p>
                <div className="text-slate-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                  {example}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
          <p className="text-slate-500 dark:text-gray-500 text-sm">
            Try this prompt with Genie AI
          </p>
          <Link
            href="/sign-up"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-medium transition-all"
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
    <div className="my-8 p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 shadow-sm dark:shadow-none">
      <p className="text-sm text-slate-600 dark:text-gray-400 mb-3">Jump to category:</p>
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
