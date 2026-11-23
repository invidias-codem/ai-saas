// app/[locale]/demo/client-ops/uncertainty/page.tsx
// C1 demo UI — Screen 4: Uncertainty review.
// Shows items that could not be confidently classified.
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DemoNav } from '../demo-nav';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Uncertainty Review — Client Operations Demo | Lattice',
    description: 'Synthetic-only demo: items that require human clarification before classification.',
  };
}

async function fetchDemoData(workspaceId: string) {
  const res = await fetch(
    `/api/demo/client-ops/uncertainty?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: 'no-store' }
  );
  if (res.status === 404) notFound();
  if (res.status === 401) redirect('/sign-in');
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error('Failed to load demo data');
  return res.json();
}

export default async function UncertaintyPage({ params, searchParams }: Props) {
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
          <DemoNav current="uncertainty" />
        </nav>

        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Uncertainty Review
        </h1>
        <p className="text-neutral-400 mb-8">
          Items that could not be confidently classified. Each requires human
          clarification before a final determination is made.
        </p>

        {/* Summary */}
        <div className="mb-8">
          <p className="text-neutral-400 text-sm">
            <span className="font-mono text-amber-400">
              {data.uncertainCount}
            </span>{' '}
            item(s) need human review.
          </p>
        </div>

        {data.uncertainItems.length === 0 ? (
          // Empty state
          <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-12 text-center">
            <div className="text-neutral-500 text-4xl mb-4">✓</div>
            <h3 className="text-lg font-semibold text-neutral-300 mb-2">
              No uncertain items
            </h3>
            <p className="text-neutral-500 text-sm">
              All checklist items were classified with sufficient confidence.
            </p>
          </section>
        ) : (
          // Uncertain items list
          <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/30">
                  <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Item</th>
                  <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Confidence</th>
                  <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Matches</th>
                  <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Reason</th>
                  <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase text-right">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {data.uncertainItems.map((item: any) => (
                  <tr key={item.itemId} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{item.itemId.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-sm text-mono">
                      {item.confidence != null ? (item.confidence * 100).toFixed(0) + '%' : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-mono">{item.matchCount ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-amber-400">{item.uncertaintyReason}</td>
                    <td className="px-4 py-3 text-sm text-mono text-neutral-400 text-right">
                      {item.evidenceIds.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Guidance */}
        <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h3 className="text-sm font-semibold text-neutral-300 mb-3">
            How to resolve uncertain items
          </h3>
          <ul className="text-neutral-500 text-sm space-y-2 list-disc pl-5">
            <li>Review the cited evidence spans for each uncertain item.</li>
            <li>Determine whether the missing keyword match is a false negative.</li>
            <li>Clarify with the client before marking an item as received.</li>
            <li>Uncertain items are never auto-resolved — human review is required.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
