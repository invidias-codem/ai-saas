'use client';

import { useEffect, useState } from 'react';
import { Activity, Server, Wifi, WifiOff, RefreshCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { MemoryFlowGraph } from '@/components/memory/MemoryFlowGraph';

type ModelDecision = {
  requestedModel: string;
  routedModel: string;
  routeReason?: string;
  fallbackUsed: boolean;
  provider: string;
};

type ToolInvocation = {
  toolId: string;
  toolName: string;
  status: 'success' | 'failure' | 'skipped';
  latencyMs: number;
  argsHash: string;
  outputSummary?: string;
};

type MemoryEvent = {
  id?: string;
  workspaceId?: string | null;
  sessionId?: string;
  source: 'siri' | 'genie' | 'system';
  entityRefs?: string[];
  toolInvocations?: ToolInvocation[];
  modelDecision?: ModelDecision;
  promptHash?: string;
  resultSummary?: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number | null;
  confidence: number | null;
  created_at?: string;
};

function formatTime(iso?: string) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function MemoryCenterPage() {
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [networkReady, setNetworkReady] = useState(true);
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch('/api/memory/events?limit=80');
        const payload = await response.json();
        if (mounted) setEvents(payload.events ?? []);
      } catch (error) {
        console.error('Failed to load memory events:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw-memory-center.js', { scope: '/' })
      .then(() => setSwReady(true))
      .catch((error) => console.debug('[MemoryCenter] SW skip:', error));
  }, []);

  // Mount-only: read browser APIs (navigator.onLine, serviceWorker)
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNetworkReady(navigator.onLine);
    }
    if (typeof window === 'undefined') return;
    const handleOnline = () => setNetworkReady(true);
    const handleOffline = () => setNetworkReady(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/memory/events?limit=80');
      const payload = await response.json();
      setEvents(payload.events ?? []);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = networkReady ? 'text-emerald-600' : 'text-red-500';

  return (
    <div className="min-h-screen px-3 sm:px-4 md:px-10 lg:px-16 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6">
      {/* Header — compact on mobile */}
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-medium">
            <Activity className="w-3 h-3 sm:w-4 sm:h-4" />
            Memory Center
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium shadow-sm hover:border-indigo-400"
          >
            <RefreshCcw className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        <h1 className="text-xl sm:text-2xl md:text-4xl font-bold tracking-tight">Inspectable inference memory</h1>
        <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl hidden sm:block">
          Visualize what context powered each response, which tools fired, and how the model was routed—locally first, then synced when available.
        </p>
      </div>

      {/* Status card — compact on mobile */}
      <Card className="p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <span className={`inline-flex items-center gap-1.5 font-medium ${statusColor}`}>
            {networkReady ? <Wifi className="w-3 h-3 sm:w-4 sm:h-4" /> : <WifiOff className="w-3 h-3 sm:w-4 sm:h-4" />}
            {networkReady ? 'Online' : 'Offline'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Server className="w-3 h-3 sm:w-4 sm:h-4" />
            SW {swReady ? 'ready' : 'skip'}
          </span>
        </div>
      </Card>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-4 sm:p-6 xl:col-span-2">
          <h2 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Entity memory flow</h2>
          <MemoryFlowGraph events={events} />
        </Card>

        {/* Why pane — desktop sidebar */}
        <div className="hidden xl:block">
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Why pane</h2>
            <WhyPane events={events} />
          </Card>
        </div>
      </div>

      {/* Mobile: Why pane as bottom sheet trigger */}
      <div className="xl:hidden">
        <WhyPaneMobile events={events} />
      </div>

      <Card className="p-4 sm:p-6">
        <h2 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Recent memory events</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events captured yet. Run a conversation to generate traces.</p>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {events.slice(0, 40).map((event) => (
              <div key={event.id ?? `${event.sessionId}-${event.created_at}`} className="rounded-lg sm:rounded-xl border border-slate-200 p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wide font-medium">{event.source}</span>
                  <span>·</span>
                  <span>{formatTime(event.created_at)}</span>
                  <span>·</span>
                  <span>{event.latencyMs}ms</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                  <span>{event.tokensIn} in / {event.tokensOut} out</span>
                  {event.modelDecision?.fallbackUsed && <span className="text-red-500 font-medium">fallback</span>}
                </div>
                {event.toolInvocations?.length ? (
                  <div className="text-xs sm:text-sm">
                    <span className="font-medium">Tools: </span>
                    {event.toolInvocations.map((tool) => (
                      <span key={tool.toolId} className="ml-1.5 sm:ml-2 inline-flex items-center gap-1">
                        <span className={tool.status === 'success' ? 'text-emerald-600' : 'text-red-500'}>{tool.toolName}</span>
                        <span className="text-muted-foreground">{tool.latencyMs}ms</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {event.resultSummary ? (
                  <p className="text-xs sm:text-sm leading-relaxed line-clamp-2">{event.resultSummary}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function WhyPaneMobile({ events }: { events: MemoryEvent[] }) {
  const [open, setOpen] = useState(false);
  const latest = events[0];

  if (!latest) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Run a conversation to see the reasoning pane.</p>
      </Card>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm"
      >
        <span>Why this response?</span>
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl bg-background border-t border-slate-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <h3 className="text-sm font-semibold">Why this response?</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-muted-foreground hover:bg-slate-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <WhyPane events={events} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WhyPane({ events }: { events: MemoryEvent[] }) {
  const latest = events[0];
  if (!latest) {
    return <p className="text-sm text-muted-foreground">Run a conversation to see the reasoning pane.</p>;
  }

  const time = formatTime(latest.created_at);
  const model = latest.modelDecision?.routedModel ?? 'unknown model';
  const provider = latest.modelDecision?.provider ?? 'unknown provider';

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1">
        <div className="text-muted-foreground">Latest inference</div>
        <div>{time}</div>
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground">Model / provider</div>
        <div>{model}</div>
        <div className="text-muted-foreground">{provider}</div>
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground">Tokens</div>
        <div>
          {latest.tokensIn} in / {latest.tokensOut} out
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground">Latency</div>
        <div>{latest.latencyMs}ms</div>
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground">Confidence</div>
        <div>{latest.confidence != null ? `${Math.round(latest.confidence * 100)}%` : '—'}</div>
      </div>
      <div className="space-y-1">
        <div className="text-muted-foreground">Cost estimate</div>
        <div>{latest.costEstimate != null ? `$${latest.costEstimate.toFixed(4)}` : '—'}</div>
      </div>
      {latest.modelDecision?.routeReason ? (
        <div className="space-y-1">
          <div className="text-muted-foreground">Route reason</div>
          <div>{latest.modelDecision.routeReason}</div>
        </div>
      ) : null}
      {latest.entityRefs?.length ? (
        <div className="space-y-1">
          <div className="text-muted-foreground">Entity refs</div>
          <div>{latest.entityRefs.slice(0, 6).join(', ')}</div>
        </div>
      ) : null}
      <div className="space-y-1">
        <div className="text-muted-foreground">Result</div>
        <div>{latest.resultSummary ?? '—'}</div>
      </div>
    </div>
  );
}
