"use client";

import { cn } from "@/lib/utils";
import EmptyState from "@/components/empty";

/** Per-modality accent family (border/gradient/text) for the state blocks. */
export type GenerationAccent = "violet" | "pink" | "emerald";

interface AccentTokens {
  border: string; // e.g. border-violet-500/20
  bgFrom: string; // gradient from-* (e.g. from-violet-500/5)
  pulse: string; // pulse overlay gradient (e.g. from-violet-500/10 via-purple-500/10 to-violet-500/10)
  glow: string; // blur glow (e.g. bg-violet-500/30)
  spinner: string; // e.g. border-violet-500/30 border-t-violet-500
  title: string; // gradient text (e.g. from-violet-600 to-purple-600)
}

const ACCENTS: Record<GenerationAccent, AccentTokens> = {
  violet: {
    border: "border-violet-500/20",
    bgFrom: "from-violet-500/5",
    pulse: "from-violet-500/10 via-purple-500/10 to-violet-500/10",
    glow: "bg-violet-500/30",
    spinner: "border-violet-500/30 border-t-violet-500",
    title: "from-violet-600 to-purple-600",
  },
  pink: {
    border: "border-pink-700/20",
    bgFrom: "from-pink-700/5",
    pulse: "from-pink-700/10 via-rose-500/10 to-pink-700/10",
    glow: "bg-pink-700/30",
    spinner: "border-pink-700/30 border-t-pink-700",
    title: "from-pink-700 to-rose-600",
  },
  emerald: {
    border: "border-emerald-500/20",
    bgFrom: "from-emerald-500/5",
    pulse: "from-emerald-500/10 via-teal-500/10 to-emerald-500/10",
    glow: "bg-emerald-500/30",
    spinner: "border-emerald-500/30 border-t-emerald-500",
    title: "from-emerald-600 to-teal-600",
  },
};

interface LoadingStateProps {
  accent: GenerationAccent;
  title: string;
  subtitle: string;
}

/** Loading spinner block — pulsing gradient panel + centered spinner + title/subtitle. */
export function GenerationLoading({ accent, title, subtitle }: LoadingStateProps) {
  const c = ACCENTS[accent];
  return (
    <div className={cn("relative rounded-2xl border bg-gradient-to-br from-background to-transparent p-8 sm:p-16 overflow-hidden", c.border, c.bgFrom)}>
      <div className={cn("absolute inset-0 bg-gradient-to-r animate-pulse", c.pulse)} />
      <div className="relative flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className={cn("absolute inset-0 blur-xl rounded-full animate-pulse", c.glow)} />
          <div className={cn("relative h-16 w-16 border-4 rounded-full animate-spin", c.spinner)} />
        </div>
        <div className="text-center space-y-2">
          <p className={cn("text-lg font-semibold bg-gradient-to-r bg-clip-text text-transparent", c.title)}>
            {title}
          </p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  /** Render the error inside the shared EmptyState placeholder (image) vs. plain text (video/music). */
  asEmptyState?: boolean;
}

/** Error block — red-bordered panel with the error message. */
export function GenerationError({ message, asEmptyState }: ErrorStateProps) {
  return (
    <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-background to-red-500/5 p-6 sm:p-8">
      {asEmptyState ? (
        <EmptyState label={message} />
      ) : (
        <p className="text-red-500 text-center text-sm">{message}</p>
      )}
    </div>
  );
}

interface EmptyStateProps {
  accent: GenerationAccent;
  label: string;
}

/** Empty/idle block — accent-tinted panel wrapping the shared EmptyState. */
export function GenerationEmpty({ accent, label }: EmptyStateProps) {
  const c = ACCENTS[accent];
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br from-background to-transparent p-8 sm:p-12", c.border, c.bgFrom)}>
      <EmptyState label={label} />
    </div>
  );
}