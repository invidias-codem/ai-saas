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
  sessionId?: string | null;
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

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  useEffect(() => {
    setNetworkReady(online);
    if (typeof window === 'undefined') return;
    const handleOnline = () => setNetworkReady(true);
    const handleOffline = () => setNetworkReady(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [online]);

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
    <div className="min-h-screen px-4 md:px-10 lg:px-16 py-8 space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-sm font-medium">
          <Activity className="w-4 h-4" />
          Memory Center
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Inspectable inference memory</h1>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:border-indigo-400"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <p className="text-muted-foreground max-w-2xl">
          Visualize what context powered each response, which tools fired, and how the model was routed—locally first, then synced when available.
        </p>
      </div>

      <Card className="p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className={`inline-flex items-center gap-2 font-medium ${statusColor}`}>
            {networkReady ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {networkReady ? 'Online — sync active' : 'Offline — events queued locally'}
          </span>
          <span className="inline-flex items-center gap-2">
            <Server className="w-4 h-4" />
            Service worker {swReady ? 'registered' : 'skipped'}
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="p-6 xl:col-span-2">
          <h2 className="font-semibold mb-4">Entity memory flow</h2>
          <MemoryFlowGraph events={events} />
        </Card>
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Why pane</h2>
          <WhyPane events={events} />
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Recent memory events</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events captured yet. Run a conversation to generate traces.</p>
        ) : (
          <div className="space-y-3">
            {events.slice(0, 40).map((event) => (
              <div key={event.id ?? `${event.sessionId}-${event.created_at}`} className="rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="uppercase tracking-wide">{event.source}</span>
                  <span>·</span>
                  <span>{formatTime(event.created_at)}</span>
                  <span>·</span>
                  <span>{event.latencyMs}ms</span>
                  <span>·</span>
                  <span>
                    {event.tokensIn} in / {event.tokensOut} out
                  </span>
                </div>
                {event.modelDecision ? (
                  <div className="text-sm">
                    <span className="font-medium">Model: </span>
                    <span>{event.modelDecision.routedModel}</span>
                    {event.modelDecision.fallbackUsed && <span className="ml-2 text-red-500">fallback</span>}
                  </div>
                ) : null}
                {event.toolInvocations?.length ? (
                  <div className="text-sm">
                    <span className="font-medium">Tools: </span>
                    {event.toolInvocations.map((tool) => (
                      <span key={tool.toolId} className="ml-2 inline-flex items-center gap-1">
                        <span className={tool.status === 'success' ? 'text-emerald-600' : 'text-red-500'}>{tool.toolName}</span>
                        <span className="text-muted-foreground">{tool.latencyMs}ms</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {event.resultSummary ? (
                  <p className="text-sm leading-relaxed">{event.resultSummary}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
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
