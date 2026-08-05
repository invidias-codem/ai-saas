'use client';

import { useEffect, useState } from 'react';

type RoutingRow = {
  request_id: string;
  route_timestamp: string;
  intent_category: string;
  execution_mode: string;
  selected_model_refs: string[];
  selected_tools: string[];
  latency_ms: number | null;
  outcome: string;
  user_correction_signal: string;
};

export default function RelayRoutingPage() {
  const [rows, setRows] = useState<RoutingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Placeholder: replace with actual admin API route
        await new Promise((resolve) => setTimeout(resolve, 500));
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Routing telemetry</h1>
        <p className="mt-4 text-neutral-400">
          Audit Bandit routing decisions from `ucol_routing_telemetry`.
        </p>

        <div className="mt-8 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-800 text-neutral-400">
              <tr>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Models</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Correction</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={8}>
                    Loading telemetry...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={8}>
                    No routing telemetry recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.request_id} className="border-b border-neutral-900">
                    <td className="px-4 py-3 font-mono text-xs">{row.request_id}</td>
                    <td className="px-4 py-3 text-xs">{row.route_timestamp}</td>
                    <td className="px-4 py-3">{row.intent_category}</td>
                    <td className="px-4 py-3">{row.execution_mode}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.selected_model_refs.join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      {row.latency_ms != null ? `${row.latency_ms}ms` : '—'}
                    </td>
                    <td className="px-4 py-3">{row.outcome}</td>
                    <td className="px-4 py-3">{row.user_correction_signal}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
