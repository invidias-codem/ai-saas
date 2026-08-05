'use client';

import { useEffect, useState } from 'react';

type WorkflowRow = {
  id: string;
  status: string;
  current_step: string;
  idempotency_key: string;
  error_state: string | null;
  updated_at: string;
};

export default function RelayWorkflowsPage() {
  const [rows, setRows] = useState<WorkflowRow[]>([]);
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
        <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
        <p className="mt-4 text-neutral-400">
          Monitor durable workflow state from `ucol_workflows`.
        </p>

        <div className="mt-8 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-800 text-neutral-400">
              <tr>
                <th className="px-4 py-3">Workflow ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Step</th>
                <th className="px-4 py-3">Idempotency key</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={6}>
                    Loading workflows...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={6}>
                    No durable workflows recorded yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-neutral-900">
                    <td className="px-4 py-3 font-mono text-xs">{row.id}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{row.current_step}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.idempotency_key}</td>
                    <td className="px-4 py-3 text-xs">{row.error_state ?? '—'}</td>
                    <td className="px-4 py-3">{row.updated_at}</td>
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
