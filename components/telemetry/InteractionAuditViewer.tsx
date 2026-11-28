"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { readClientLedger, clearClientLedger } from "@/lib/telemetry/clientEmitter";
import { flushNativeTelemetry, clientPublicKeyHex, isTauri } from "@/lib/telemetry/native";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";

/**
 * Observability dashboard for the sovereign client IndexedDB ledger (Phase 2.3).
 * Reads UDIF 2.0 interaction-audit records locally and offers a flush to the
 * enterprise telemetry instance (Phase 3). Content marked local_only is never
 * exported (enforced in flushClientLedger).
 */
export function InteractionAuditViewer() {
  const [records, setRecords] = useState<UdifInteractionAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [flushMsg, setFlushMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const recs = await readClientLedger();
    // Newest first.
    recs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    setRecords(recs);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const flush = useCallback(async () => {
    setFlushMsg("Flushing...");
    const res = await flushNativeTelemetry({ clearOnSuccess: true });
    setFlushMsg(`Sent ${res.sent}/${res.attempted} (failed ${res.failed}) — mode: ${res.mode}.`);
    await refresh();
  }, [refresh]);

  const clearLocal = useCallback(async () => {
    await clearClientLedger();
    await refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const byProvider: Record<string, number> = {};
    let creditTotal = 0;
    for (const r of records) {
      const p = r.ai_ledger.system_provider;
      byProvider[p] = (byProvider[p] || 0) + 1;
      creditTotal += Number(r.context_baggage?.credit_cost || 0);
    }
    return { count: records.length, byProvider, creditTotal };
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Sovereign AI Telemetry — Local Ledger</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={refresh}
            className="rounded border px-2.5 py-1.5 text-xs sm:text-sm hover:bg-neutral-100"
          >
            Refresh
          </button>
          <button
            onClick={flush}
            className="rounded border px-2.5 py-1.5 text-xs sm:text-sm hover:bg-neutral-100"
          >
            <span className="hidden sm:inline">Flush to enterprise</span>
            <span className="sm:hidden">Flush</span>
          </button>
          <button
            onClick={clearLocal}
            className="rounded border px-2.5 py-1.5 text-xs sm:text-sm text-red-600 hover:bg-red-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* KPI Stats: 2-col grid on mobile, 3-col on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
        <Stat label="Records" value={String(stats.count)} />
        <Stat label="Credits used" value={String(stats.creditTotal)} />
        <Stat
          label="Providers"
          value={Object.entries(stats.byProvider)
            .map(([k, v]) => `${k}:${v}`)
            .join("  ")}
        />
      </div>

      {flushMsg && <p className="text-xs text-neutral-500">{flushMsg}</p>}
      {loading && <p className="text-sm text-neutral-500">Loading local ledger…</p>}
      {!loading && records.length === 0 && (
        <p className="text-sm text-neutral-500">
          No local records yet. Interact with the chat/code surfaces (the telemetry
          Service Worker will capture them) or flush server-emitted records.
        </p>
      )}

      {/* Mobile: stacked cards with expandable JSON */}
      <div className="sm:hidden space-y-2">
        {records.map((r) => {
          const id = `${r.trace_context.trace_id}:${r.trace_context.span_id}`;
          const isExpanded = expandedId === id;
          return (
            <div
              key={id}
              className="rounded-lg border bg-white p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge>{r.ai_ledger.system_provider}</Badge>
                  <Badge>{r.context_baggage?.content_mode ?? "metadata"}</Badge>
                </div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className="p-1 text-neutral-500"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-xs text-neutral-500">{r.timestamp}</div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge>req: {r.ai_ledger["gen_ai.request.model"]}</Badge>
                <Badge>res: {r.ai_ledger["gen_ai.response.model"]}</Badge>
                <Badge>credits: {r.context_baggage?.credit_cost ?? "0"}</Badge>
              </div>
              {isExpanded && (
                <div className="mt-2 rounded bg-neutral-950 p-2 text-xs text-neutral-300 font-mono overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify(r, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <ul className="hidden sm:block divide-y divide-neutral-200">
        {records.map((r) => (
          <li key={`${r.trace_context.trace_id}:${r.trace_context.span_id}`} className="py-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <Badge>{r.ai_ledger.system_provider}</Badge>
              <Badge>req: {r.ai_ledger["gen_ai.request.model"]}</Badge>
              <Badge>res: {r.ai_ledger["gen_ai.response.model"]}</Badge>
              {r.ai_ledger.governance && (
                <Badge>role: {r.ai_ledger.governance.context_role}</Badge>
              )}
              <Badge>credits: {r.context_baggage?.credit_cost ?? "0"}</Badge>
              <Badge>{r.context_baggage?.content_mode ?? "metadata"}</Badge>
            </div>
            <div className="mt-1 text-neutral-500">{r.timestamp}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-neutral-500 text-xs">{label}</div>
      <div className="font-mono text-sm truncate">{value}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px]">
      {children}
    </span>
  );
}
