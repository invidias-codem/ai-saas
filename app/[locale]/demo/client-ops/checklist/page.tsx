// app/[locale]/demo/client-ops/checklist/page.tsx
// C1 demo UI — Screen 2: Document checklist.
// Shows each checklist item with its determination status.
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DemoNav } from '../demo-nav';
import { apiUrl } from '@/lib/pilots/clientOps/demoUrl';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Document Checklist — Client Operations Demo | Lattice',
    description: 'Synthetic-only demo: checklist item determinations with evidence citations.',
  };
}

async function fetchDemoData(workspaceId: string) {
  const res = await fetch(await apiUrl('/api/demo/client-ops/checklist', { workspaceId }), {
    cache: 'no-store',
  });
  if (res.status === 404) notFound();
  if (res.status === 401) redirect('/sign-in');
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error('Failed to load demo data');
  return res.json();
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  received: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  missing: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  uncertain: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
};

export default async function ChecklistPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { workspaceId } = await searchParams;

  if (!workspaceId) {
    notFound();
  }

  let data;
  try {
    data = await fetchDemoData(workspaceId);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="flex items-center gap-4 mb-8">
          <DemoNav current="checklist" locale={locale} workspaceId={workspaceId} />
        </nav>

        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Document Checklist
        </h1>
        <p className="text-neutral-400 mb-8">
          Deterministic classification of each checklist item against synthetic
          source documents. Statuses: received, missing, uncertain.
        </p>

        {/* Summary metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">
              Total
            </div>
            <div className="text-xl font-mono font-bold">{data.metrics.totalItems}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-emerald-500 text-xs uppercase tracking-wider mb-1">
              Received
            </div>
            <div className="text-xl font-mono font-bold text-emerald-400">
              {data.metrics.receivedCount}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-rose-500 text-xs uppercase tracking-wider mb-1">
              Missing
            </div>
            <div className="text-xl font-mono font-bold text-rose-400">
              {data.metrics.missingCount}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-amber-500 text-xs uppercase tracking-wider mb-1">
              Uncertain
            </div>
            <div className="text-xl font-mono font-bold text-amber-400">
              {data.metrics.uncertainCount}
            </div>
          </div>
        </div>

        {/* Checklist table */}
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/30">
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Item</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Status</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Confidence</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Matches</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Evidence</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase text-right">Required</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {data.items.map((item: any) => {
                const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.uncertain;
                return (
                  <tr key={item.itemId} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">
                      {item.itemId.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-300">
                      {item.confidence != null ? (item.confidence * 100).toFixed(0) + '%' : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-300 text-mono">
                      {item.matchCount ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-300 text-mono">
                      {item.evidenceCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {item.uncertaintyReason ? (
                        <span className="text-amber-400 text-xs" title={item.uncertaintyReason}>
                          ⚠
                        </span>
                      ) : (
                        <span className="text-neutral-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Notice */}
        <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-amber-200 text-sm">
            ⚠️ All data is synthetic. Determinations come from keyword matching
            against fictional fixtures — not real customer documents.
          </p>
        </div>
      </div>
    </main>
  );
}
