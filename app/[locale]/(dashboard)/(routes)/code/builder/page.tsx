'use client';

// Code Builder — UCOL multi-model collaborative app builder.
// Route: /code/builder
// Gemini plans → Claude codes → Context Flow visible in real time.
//
// Phase 4A: Durable execution behind feature flag
//   CODE_BUILDER_DURABLE_EXECUTION=true  → POST /build + poll GET /build/[buildId]
//   CODE_BUILDER_DURABLE_EXECUTION=false → existing SSE /stream path

import { useState, useCallback, useEffect, useRef } from 'react';
import { PromptInput } from '../components/PromptInput';
import { PlanPanel } from '../components/PlanPanel';
import { CodePanel } from '../components/CodePanel';
import { ContextFlowVisualizer } from '../components/ContextFlowVisualizer';
import type { ProjectPlan, GeneratedFile, ContextFlowEntry } from '@/lib/ucol/types';
import { AlertCircle, Loader2 } from 'lucide-react';

type BuildPhase = 'idle' | 'planning' | 'coding' | 'done';

interface DurableBuildStatus {
  buildId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: 'queued' | 'planning' | 'generating' | 'verifying' | 'complete';
  progress: number;
  error: { code: string | null; message: string } | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// Feature flag - use env variable pattern consistent with codebase
const DURABLE_EXECUTION = process.env.NEXT_PUBLIC_CODE_BUILDER_DURABLE_EXECUTION === 'true';
// localStorage key for active durable build recovery
const ACTIVE_BUILD_KEY = 'lattice:code-builder:active-build-id';

// Trigger run statuses that mean the run is done (mapped from the relay's
// product-boundary status event). These include the CRASHED/CANCELED/TIMED_OUT
// family, which bypass the worker's onFailure hook.
const TERMINAL_RUN_STATUSES = new Set([
    'COMPLETED_SUCCESSFULLY',
    'COMPLETED_WITH_ERRORS',
    'CANCELED',
    'CRASHED',
    'SYSTEM_FAILURE',
    'EXPIRED',
    'TIMED_OUT',
]);

function isTerminalRunStatus(status: unknown): boolean {
    return typeof status === 'string' && TERMINAL_RUN_STATUSES.has(status);
}

function getActiveBuildId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_BUILD_KEY);
  } catch {
    return null;
  }
}

function setActiveBuildId(buildId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (buildId) {
      localStorage.setItem(ACTIVE_BUILD_KEY, buildId);
    } else {
      localStorage.removeItem(ACTIVE_BUILD_KEY);
    }
  } catch { }
}

export default function CodeBuilderPage() {
    const [phase, setPhase] = useState<BuildPhase>('idle');
    const [plan, setPlan] = useState<ProjectPlan | null>(null);
    const [files, setFiles] = useState<GeneratedFile[]>([]);
    const [contextFlow, setContextFlow] = useState<ContextFlowEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [mobileTab, setMobileTab] = useState<'plan' | 'code'>('plan');
    
    // Durable execution state — polling lifecycle is owned by pollIntervalRef;
    // the buildId display state lands with Phase 4B (Realtime) if needed.
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSubmittingRef = useRef(false);
    const realtimeSubRef = useRef<{ unsubscribe: () => void } | null>(null);

    const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        realtimeSubRef.current?.unsubscribe();
        realtimeSubRef.current = null;
    }, []);

    const mapDurablePhase = (status: DurableBuildStatus['status'], dPhase: DurableBuildStatus['phase']): BuildPhase => {
        if (status === 'completed') return 'done';
        if (status === 'failed' || status === 'cancelled') return 'done';
        if (dPhase === 'planning') return 'planning';
        if (dPhase === 'generating' || dPhase === 'verifying') return 'coding';
        if (status === 'running' || status === 'queued') return 'planning';
        return 'idle';
    };

    const pollDurableStatus = useCallback(async (buildId: string) => {
        try {
            const res = await fetch(`/api/code-builder/build/${buildId}`, {
                headers: { 'Accept': 'application/json' },
            });
            
            if (!res.ok) {
                if (res.status === 404) {
                    stopPolling();
                    setError('Build not found');
                    setPhase('done');
                }
                return;
            }
            
            const data: DurableBuildStatus = await res.json();
            setPhase(mapDurablePhase(data.status, data.phase));
            
            // Handle terminal states
            if (data.status === 'completed') {
                stopPolling();
                setActiveBuildId(null);
            } else if (data.status === 'failed' || data.status === 'cancelled') {
                stopPolling();
                setActiveBuildId(null);
                setError(data.error?.message || `Build ${data.status}`);
                setPhase('done');
            }
        } catch (err) {
            // Transient polling error - do not mark build failed
            console.warn('[CodeBuilder] Polling error:', err);
        }
    }, [stopPolling]);

    // Phase 4B: subscribe to the product relay for the run's terminal signal.
    // The relay streams Trigger's run lifecycle (server-side; no Trigger
    // internals reach the browser). Statuses map through the existing
    // mapDurablePhase machine; per-phase progress stays on polling (Supabase
    // is the durable state). EventSource auto-reconnects past Vercel's 300s
    // function cap on the relay — each reconnect replays current run state.
    // Any failure is non-fatal by design — polling is the fallback backbone.
    const subscribeRealtime = useCallback(async (buildId: string) => {
        try {
            const es = new EventSource(`/api/code-builder/build/${buildId}/events`);
            realtimeSubRef.current = {
                unsubscribe: () => es.close(),
            };
            es.addEventListener('run-status', (e) => {
                try {
                    const { status } = JSON.parse((e as MessageEvent).data);
                    if (isTerminalRunStatus(status)) {
                        // Authoritative state lives in Supabase — read it now
                        // (plus a 5s grace re-read for hook persistence lag).
                        void pollDurableStatus(buildId);
                        setTimeout(() => { void pollDurableStatus(buildId); }, 5_000);
                        es.close();
                    }
                } catch { /* malformed event — polling covers it */ }
            });
            es.onerror = () => {
                // EventSource retries on its own; keep poll fallback alive.
            };
        } catch (err) {
            console.warn('[CodeBuilder] Realtime unavailable, polling remains:', err);
        }
    }, [pollDurableStatus]);

    const handleBuild = useCallback(async (prompt: string) => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        
        // Reset state
        setPhase('planning');
        setPlan(null);
        setFiles([]);
        setContextFlow([]);
        setError(null);
        stopPolling();

        try {
            if (DURABLE_EXECUTION) {
                // Durable path: POST /api/code-builder/build → poll GET /api/code-builder/build/[buildId]
                const res = await fetch('/api/code-builder/build', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, mode: 'fast' }), // Use fast mode for now
                });
                
                const data = await res.json();
                
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to start build');
                }
                
                if (!data.buildId || !data.runId) {
                    throw new Error('Invalid response from build API');
                }
                
                setActiveBuildId(data.buildId);
                
                // Initial poll
                await pollDurableStatus(data.buildId);
                
                // Start polling interval
                pollIntervalRef.current = setInterval(() => {
                    pollDurableStatus(data.buildId);
                }, 1500); // Poll every 1.5s
                void subscribeRealtime(data.buildId);
                
            } else {
                // Existing SSE path
                const url = `/api/code-builder/stream?prompt=${encodeURIComponent(prompt)}`;
                const eventSource = new EventSource(url);

                eventSource.addEventListener('context-flow', (e) => {
                    try {
                        const entry: ContextFlowEntry = JSON.parse(e.data);
                        setContextFlow(prev => [...prev, entry]);
                    } catch { }
                });

                eventSource.addEventListener('component-error', (e) => {
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
                        setMobileTab('code');
                    } catch { }
                });

                eventSource.addEventListener('error', (e) => {
                    try {
                        const data = JSON.parse((e as MessageEvent).data);
                        setError(data.message || 'An error occurred during build');
                        setPhase('done');
                    } catch {
                        setError('Connection lost. Please try again.');
                        setPhase('done');
                    }
                    eventSource.close();
                });

                eventSource.addEventListener('done', (e) => {
                    setPhase('done');
                    eventSource.close();
                });

                eventSource.onerror = () => {
                    if (eventSource.readyState === EventSource.CLOSED) return;
                    setError('Connection error. Please try again.');
                    setPhase('done');
                    eventSource.close();
                };
            }
        } catch (err: any) {
            setError(err.message || 'Failed to start build');
            setPhase('done');
        } finally {
            isSubmittingRef.current = false;
        }
    }, [pollDurableStatus, stopPolling, subscribeRealtime]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    const handleReset = () => {
        stopPolling();
        setActiveBuildId(null);
        setPhase('idle');
        setPlan(null);
        setFiles([]);
        setContextFlow([]);
        setError(null);
        setMobileTab('plan');
    };

    // Recover active build on mount (browser close/reopen).
    // durableBuildId/polling state intentionally not set here: both are
    // write-only for render; the interval below IS the recovery behavior.
    useEffect(() => {
        if (DURABLE_EXECUTION) {
            const activeBuildId = getActiveBuildId();
            if (activeBuildId) {
                // setState lives inside the async callback, not the effect body
                // (react-hooks/set-state-in-effect).
                Promise.resolve().then(() => pollDurableStatus(activeBuildId));
                pollIntervalRef.current = setInterval(() => {
                    pollDurableStatus(activeBuildId);
                }, 1500);
                // Deferred: setState happens in the async chain, not the effect body.
                Promise.resolve().then(() => subscribeRealtime(activeBuildId));
            }
        }
    }, [pollDurableStatus, subscribeRealtime]);

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
                        <p className="text-[10px] text-zinc-500">
                            {DURABLE_EXECUTION ? 'Durable execution via Trigger.dev' : 'Gemini plans · Claude codes · UCOL orchestrates'}
                        </p>
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

            {/* Mobile tab switcher (hidden on md+) */}
            {(plan || files.length > 0 || phase === 'planning' || phase === 'coding') && (
                <div className="md:hidden flex-none flex gap-1 px-4 pt-3">
                    <button
                        onClick={() => setMobileTab('plan')}
                        className={`flex-1 text-[11px] font-medium py-2 rounded-lg border transition-colors ${mobileTab === 'plan'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            : 'text-zinc-500 border-zinc-800/60 hover:text-zinc-300'
                        }`}
                    >
                        🧠 Plan{plan ? ` · ${plan.components.length}` : ''}
                    </button>
                    <button
                        onClick={() => setMobileTab('code')}
                        className={`flex-1 text-[11px] font-medium py-2 rounded-lg border transition-colors ${mobileTab === 'code'
                            ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                            : 'text-zinc-500 border-zinc-800/60 hover:text-zinc-300'
                        }`}
                    >
                        ⚙️ Code{files.length > 0 ? ` · ${files.length}` : ''}
                    </button>
                </div>
            )}

            {/* Main content: tabs on mobile, Plan + Code side by side on md+ */}
            {(plan || files.length > 0 || phase === 'planning' || phase === 'coding') && (
                <div className="flex-1 flex gap-3 p-3 sm:p-4 overflow-hidden min-h-0">
                    <div className={`${mobileTab === 'plan' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 min-h-0`}>
                        <PlanPanel plan={plan} loading={phase === 'planning'} />
                    </div>
                    <div className={`${mobileTab === 'code' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 min-h-0`}>
                        <CodePanel files={files} loading={phase === 'coding'} />
                    </div>
                </div>
            )}
        </div>
    );
}
