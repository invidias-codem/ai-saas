// app/[locale]/demo/client-ops/page.tsx
// C1 demo UI — Screen 1: Engagement overview.
// Fetches synthetic evaluation data from the protected API route.
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DemoNav } from './demo-nav';
import { apiUrl } from '@/lib/pilots/clientOps/demoUrl';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ workspaceId?: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `Engagement Overview — Client Operations Demo | Lattice`,
    description: 'Synthetic-only demo: intake-checklist classification and review-only follow-up draft.',
  };
}

async function fetchDemoData(workspaceId: string) {
  const res = await fetch(await apiUrl('/api/demo/client-ops', { workspaceId }), {
    cache: 'no-store',
  });
  if (res.status === 404) notFound();
  if (res.status === 401) redirect('/sign-in');
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error('Failed to load demo data');
  return res.json();
}

export default async function EngagementOverviewPage({ params, searchParams }: Props) {
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

  const m = data.metrics;
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="flex items-center gap-4 mb-8">
          <DemoNav current="overview" locale={locale} workspaceId={workspaceId} />
          <a
            href={`/${locale}`}
            className="ml-auto text-xs text-neutral-500 hover:text-neutral-300 underline"
          >
            Back to site
          </a>
        </nav>

        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Engagement Overview
        </h1>
        <p className="text-neutral-400 mb-8">
          Synthetic demo — no customer data. All results are deterministic
          classification from fictional fixtures.
        </p>

        {/* Metrics grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">
              Total items
            </div>
            <div className="text-2xl font-mono font-bold">{m.totalItems}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="text-emerald-500 text-xs uppercase tracking-wider mb-1">
              Received
            </div>
            <div className="text-2xl font-mono font-bold text-emerald-400">
              {m.receivedCount}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="text-rose-500 text-xs uppercase tracking-wider mb-1">
              Missing
            </div>
            <div className="text-2xl font-mono font-bold text-rose-400">
              {m.missingCount}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="text-amber-500 text-xs uppercase tracking-wider mb-1">
              Uncertain
            </div>
            <div className="text-2xl font-mono font-bold text-amber-400">
              {m.uncertainCount}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">
              Required completeness
            </div>
            <div className="text-2xl font-mono font-bold">
              {(m.requiredCompleteness * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="text-neutral-500 text-xs uppercase tracking-wider mb-1">
              Mean confidence
            </div>
            <div className="text-2xl font-mono font-bold">
              {(m.meanConfidence * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Engagement details */}
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Engagement details</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <dt className="w-24 text-neutral-500 text-sm font-medium">Engagement ID</dt>
              <dd className="text-sm font-mono">{data.engagementId}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-24 text-neutral-500 text-sm font-medium">Tenant</dt>
              <dd className="text-sm font-mono">{data.tenantId}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-24 text-neutral-500 text-sm font-medium">Workspace</dt>
              <dd className="text-sm font-mono">{data.workspaceId}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-24 text-neutral-500 text-sm font-medium">Evaluator</dt>
              <dd className="text-sm font-mono">{data.evaluatorVersion}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-24 text-neutral-500 text-sm font-medium">Evaluated at</dt>
              <dd className="text-sm">{data.evaluatedAt}</dd>
            </div>
            <div className="flex items-start gap-3">
              <dt className="w-24 text-neutral-500 text-sm font-medium">Mode</dt>
              <dd className="text-sm text-neutral-400">Synthetic demo</dd>
            </div>
          </dl>
        </section>

        {/* Notice */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-amber-200 text-sm">
            ⚠️ This is a review-only demonstration. No messages have been sent,
            and no external systems have been contacted.
          </p>
        </div>
      </div>
    </main>
  );
}
