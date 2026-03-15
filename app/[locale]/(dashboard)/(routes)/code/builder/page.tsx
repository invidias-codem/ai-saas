'use client';

// Code Builder — UCOL multi-model collaborative app builder.
// Route: /code/builder
// Gemini plans → Claude codes → Context Flow visible in real time.

import { useState, useCallback } from 'react';
import { PromptInput } from '../components/PromptInput';
import { PlanPanel } from '../components/PlanPanel';
import { CodePanel } from '../components/CodePanel';
import { ContextFlowVisualizer } from '../components/ContextFlowVisualizer';
import type { ProjectPlan, GeneratedFile, ContextFlowEntry } from '@/lib/ucol/types';
import { AlertCircle } from 'lucide-react';

type BuildPhase = 'idle' | 'planning' | 'coding' | 'done';

export default function CodeBuilderPage() {
    const [phase, setPhase] = useState<BuildPhase>('idle');
    const [plan, setPlan] = useState<ProjectPlan | null>(null);
    const [files, setFiles] = useState<GeneratedFile[]>([]);
    const [contextFlow, setContextFlow] = useState<ContextFlowEntry[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleBuild = useCallback(async (prompt: string) => {
        // Reset state
        setPhase('planning');
        setPlan(null);
        setFiles([]);
        setContextFlow([]);
        setError(null);

        try {
            const url = `/api/code-builder/stream?prompt=${encodeURIComponent(prompt)}`;
            const eventSource = new EventSource(url);

            eventSource.addEventListener('context-flow', (e) => {
                try {
                    const entry: ContextFlowEntry = JSON.parse(e.data);
                    setContextFlow(prev => [...prev, entry]);
                } catch { }
            });

            eventSource.addEventListener('plan-ready', (e) => {
                try {
                    const planData: ProjectPlan = JSON.parse(e.data);
                    setPlan(planData);
                    setPhase('coding');
                } catch { }
            });

            eventSource.addEventListener('file-generated', (e) => {
                try {
                    const file: GeneratedFile = JSON.parse(e.data);
                    setFiles(prev => [...prev, file]);
                } catch { }
            });

            eventSource.addEventListener('error', (e) => {
                try {
                    // SSE error event from our server
                    const data = JSON.parse((e as MessageEvent).data);
                    setError(data.message || 'An error occurred during build');
                    setPhase('done');
                } catch {
                    // Browser-level EventSource error (disconnect, etc.)
                    setError('Connection lost. Please try again.');
                    setPhase('done');
                }
                eventSource.close();
            });

            eventSource.addEventListener('done', (e) => {
                setPhase('done');
                eventSource.close();
            });

            // Safety: close on unrecoverable native errors
            eventSource.onerror = () => {
                if (eventSource.readyState === EventSource.CLOSED) {
                    // Already closed by a named error event — ignore
                    return;
                }
                setError('Connection error. Please try again.');
                setPhase('done');
                eventSource.close();
            };
        } catch (err: any) {
            setError(err.message || 'Failed to start build');
            setPhase('done');
        }
    }, []);

    const handleReset = () => {
        setPhase('idle');
        setPlan(null);
        setFiles([]);
        setContextFlow([]);
        setError(null);
    };

    return (
        <div className="h-[100dvh] flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
            {/* Header */}
            <header className="flex-none px-4 py-3 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md z-20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-white/5">
                        <span className="text-sm">⚡</span>
                    </div>
                    <div>
                        <h1 className="text-sm font-bold tracking-tight">Code Builder</h1>
                        <p className="text-[10px] text-zinc-500">Gemini plans · Claude codes · UCOL orchestrates</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {phase !== 'idle' && (
                        <div className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${phase === 'planning' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                phase === 'coding' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                            {phase === 'planning' ? '🧠 Planning...' :
                                phase === 'coding' ? '⚙️ Generating...' :
                                    `✓ ${files.length} files`}
                        </div>
                    )}

                    {phase === 'done' && (
                        <button
                            onClick={handleReset}
                            className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
                        >
                            New Build
                        </button>
                    )}
                </div>
            </header>

            {/* Prompt Input — always visible */}
            <PromptInput
                onSubmit={handleBuild}
                disabled={phase === 'planning' || phase === 'coding'}
                phase={phase}
            />

            {/* Context Flow Visualizer */}
            {contextFlow.length > 0 && (
                <ContextFlowVisualizer entries={contextFlow} />
            )}

            {/* Error banner */}
            {error && (
                <div className="mx-4 mt-2 flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg text-xs animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="ml-auto text-red-400/60 hover:text-red-300"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Main content: Plan + Code side by side */}
            {(plan || files.length > 0 || phase === 'planning' || phase === 'coding') && (
                <div className="flex-1 flex gap-3 p-4 overflow-hidden min-h-0">
                    <PlanPanel plan={plan} loading={phase === 'planning'} />
                    <CodePanel files={files} loading={phase === 'coding'} />
                </div>
            )}
        </div>
    );
}
