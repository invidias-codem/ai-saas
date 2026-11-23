// app/[locale]/demo/client-ops/evidence/page.tsx
// C1 demo UI — Screen 3: Cited evidence.
// Shows source evidence spans with SHA-256 content hashes.
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
    title: 'Cited Evidence — Client Operations Demo | Lattice',
    description: 'Synthetic-only demo: evidence spans cited for each determination with SHA-256 integrity hashes.',
  };
}

async function fetchDemoData(workspaceId: string) {
  const res = await fetch(
    `/api/demo/client-ops/evidence?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: 'no-store' }
  );
  if (res.status === 404) notFound();
  if (res.status === 401) redirect('/sign-in');
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error('Failed to load demo data');
  return res.json();
}

export default async function EvidencePage({ params, searchParams }: Props) {
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
          <DemoNav current="evidence" />
        </nav>

        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Cited Evidence
        </h1>
        <p className="text-neutral-400 mb-8">
          Source evidence spans cited for received and uncertain determinations.
          Each span carries a SHA-256 content hash for tamper detection.
        </p>

        {/* Summary */}
        <div className="mb-8">
          <p className="text-neutral-400 text-sm">
            <span className="font-mono text-neutral-300">
              {data.evidenceSpanCount}
            </span>{' '}
            evidence spans cited across the engagement.
          </p>
        </div>

        {/* Evidence list */}
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900/30">
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Evidence ID</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Description</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase">Range</th>
                <th className="px-4 py-3 text-neutral-400 text-xs font-semibold uppercase text-right">SHA-256 hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {data.evidence.map((span: any) => (
                <tr key={span.evidenceId} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-neutral-300">
                    {span.evidenceId}
                  </td>
                  <td className="px-4 py-3 text-sm">{span.description}</td>
                  <td className="px-4 py-3 text-sm text-mono text-neutral-400">
                    {span.charStart}–{span.charEnd}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-neutral-300 text-right truncate max-w-xs" title={span.contentHash}>
                    {span.contentHash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Hash explanation */}
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h3 className="text-sm font-semibold text-neutral-300 mb-3">
            About content hashes
          </h3>
          <p className="text-neutral-500 text-sm">
            Each evidence span is fingerprinted with SHA-256. The hash detects
            tampering of the source text — if the content changes, the hash
            changes. These are integrity digests, not cryptographic signatures.
          </p>
        </div>
      </div>
    </main>
  );
}
