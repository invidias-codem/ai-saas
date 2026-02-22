'use client';

// ContextFlowVisualizer — the signature UCOL showcase component.
// Shows context routing between models in real-time.

import type { ContextFlowEntry } from '@/lib/ucol/types';

interface ContextFlowVisualizerProps {
    entries: ContextFlowEntry[];
}

const MODEL_STYLES: Record<string, string> = {
    gemini: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    claude: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    user: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/30',
    system: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const STATUS_STYLES: Record<string, string> = {
    active: 'text-green-400',
    complete: 'text-zinc-500',
    error: 'text-red-400',
};

export function ContextFlowVisualizer({ entries }: ContextFlowVisualizerProps) {
    if (entries.length === 0) return null;

    const latestActive = entries.findLast(e => e.status === 'active');

    return (
        <div className="border-b border-border/30 bg-zinc-950/80 backdrop-blur-sm px-4 py-3">
            {/* Header */}
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
                <span className="relative flex h-2 w-2">
                    {latestActive && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${latestActive ? 'bg-green-400' : 'bg-zinc-600'}`} />
                </span>
                <span className="font-medium tracking-wider uppercase text-[10px]">Context Flow</span>
                <span className="text-zinc-600 ml-auto text-[10px] font-mono">{entries.length} events</span>
            </div>

            {/* Flow entries — horizontally scrollable */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
                {entries.map((entry, i) => (
                    <div key={entry.id} className="flex items-center gap-1.5 shrink-0">
                        {/* Source badge */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${MODEL_STYLES[entry.source] || MODEL_STYLES.user}`}>
                            {entry.source}
                        </span>

                        {/* Arrow */}
                        <svg className="w-4 h-3 text-zinc-600 shrink-0" viewBox="0 0 16 12" fill="none">
                            <path d="M1 6h12M10 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>

                        {/* Action text */}
                        <span className={`text-[11px] font-mono whitespace-nowrap ${STATUS_STYLES[entry.status] || 'text-zinc-500'}`}>
                            {entry.action}
                        </span>

                        <svg className="w-4 h-3 text-zinc-600 shrink-0" viewBox="0 0 16 12" fill="none">
                            <path d="M1 6h12M10 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>

                        {/* Target badge */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${MODEL_STYLES[entry.target] || MODEL_STYLES.user}`}>
                            {entry.target}
                        </span>

                        {/* Separator */}
                        {i < entries.length - 1 && (
                            <span className="text-zinc-800 mx-1 select-none">│</span>
                        )}
                    </div>
                ))}
            </div>

            {/* Active reasoning detail */}
            {latestActive && (
                <div className="mt-2 text-[10px] text-zinc-500 font-mono truncate">
                    <span className="text-zinc-600">reason:</span> {latestActive.reasoning}
                </div>
            )}
        </div>
    );
}
