"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { readClientLedger, clearClientLedger } from "@/lib/telemetry/clientEmitter";
import { flushNativeTelemetry, clientPublicKeyHex, isTauri } from "@/lib/telemetry/native";
import type { UdifInteractionAudit } from "@/lib/telemetry/udif";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sovereign AI Telemetry — Local Ledger</h2>
        <div className="space-x-2">
          <button
            onClick={refresh}
            className="rounded border px-3 py-1 text-sm hover:bg-neutral-100"
          >
            Refresh
          </button>
          <button
            onClick={flush}
            className="rounded border px-3 py-1 text-sm hover:bg-neutral-100"
          >
            Flush to enterprise
          </button>
          <button
            onClick={clearLocal}
            className="rounded border px-3 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Clear local
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
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

      <ul className="divide-y divide-neutral-200">
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
      <div className="text-neutral-500">{label}</div>
      <div className="font-mono">{value}</div>
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
