'use client';

// ContextFlowVisualizer — the signature UCOL showcase component.
// Shows context routing between models in real-time.

import type { ContextFlowEntry } from '@/lib/ucol/types';

interface ContextFlowVisualizerProps {
    entries: ContextFlowEntry[];
}

const MODEL_STYLES: Record<string, string> = {
    gemini: 'bg-accent text-primary border-primary/30',
    claude: 'bg-accent text-accent-foreground border-accent-foreground/30',
    user: 'bg-muted text-foreground border-border',
    system: 'bg-accent text-primary border-primary/30',
};

const STATUS_STYLES: Record<string, string> = {
    active: 'text-primary',
    complete: 'text-muted-foreground',
    error: 'text-destructive',
};

export function ContextFlowVisualizer({ entries }: ContextFlowVisualizerProps) {
    if (entries.length === 0) return null;

    const latestActive = entries.findLast(e => e.status === 'active');

    return (
        <div className="border-b border-border/30 bg-background backdrop-blur-sm px-4 py-3">
            {/* Header */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <span className="relative flex h-2 w-2">
                    {latestActive && (
                        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${latestActive ? 'bg-primary' : 'bg-muted-foreground'}`} />
                </span>
                <span className="font-medium tracking-wider uppercase text-[10px]">Context Flow</span>
                <span className="text-muted-foreground ml-auto text-[10px] font-mono">{entries.length} events</span>
            </div>

            {/* Flow entries — horizontally scrollable */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
                {entries.map((entry, i) => (
                    <div key={entry.id} className="flex items-center gap-1.5 shrink-0">
                        {/* Source badge */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${MODEL_STYLES[entry.source] || MODEL_STYLES.user}`}>
                            {entry.source}
                        </span>

                        {/* Arrow */}
                        <svg className="w-4 h-3 text-muted-foreground shrink-0" viewBox="0 0 16 12" fill="none">
                            <path d="M1 6h12M10 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>

                        {/* Action text */}
                        <span className={`text-[11px] font-mono whitespace-nowrap ${STATUS_STYLES[entry.status] || 'text-muted-foreground'}`}>
                            {entry.action}
                        </span>

                        <svg className="w-4 h-3 text-muted-foreground shrink-0" viewBox="0 0 16 12" fill="none">
                            <path d="M1 6h12M10 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>

                        {/* Target badge */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${MODEL_STYLES[entry.target] || MODEL_STYLES.user}`}>
                            {entry.target}
                        </span>

                        {/* Separator */}
                        {i < entries.length - 1 && (
                            <span className="text-muted-foreground mx-1 select-none">│</span>
                        )}
                    </div>
                ))}
            </div>

            {/* Active reasoning detail */}
            {latestActive && (
                <div className="mt-2 text-[10px] text-muted-foreground font-mono truncate">
                    <span className="text-muted-foreground">reason:</span> {latestActive.reasoning}
                </div>
            )}
        </div>
    );
}
