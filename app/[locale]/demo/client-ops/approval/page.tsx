// app/[locale]/demo/client-ops/approval/page.tsx
// C1 demo UI — Screen 5: Follow-up draft approval.
// Read-only display of the human-review draft. No send/dispatch/mutate actions.
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
    title: 'Follow-Up Draft Approval — Client Operations Demo | Lattice',
    description: 'Synthetic-only demo: human-review-only follow-up draft. Not sent automatically.',
  };
}

async function fetchDemoData(workspaceId: string) {
  const res = await fetch(
    `/api/demo/client-ops/approval?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: 'no-store' }
  );
  if (res.status === 404) notFound();
  if (res.status === 401) redirect('/sign-in');
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error('Failed to load demo data');
  return res.json();
}

export default async function ApprovalPage({ params, searchParams }: Props) {
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
      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="flex items-center gap-4 mb-8">
          <DemoNav current="approval" />
        </nav>

        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Follow-Up Draft Approval
        </h1>
        <p className="text-neutral-400 mb-8">
          Human-review-only draft. Read-only — no message has been sent and no
          external system has been contacted.
        </p>

        {/* Security notice (prominent) */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 mb-8">
          <p className="text-amber-200 text-sm font-medium">
            ⚠️ Review-only draft
          </p>
          <p className="text-amber-200 text-sm mt-1">
            {data.notice}
          </p>
        </div>

        {/* Draft card */}
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 mb-8">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-neutral-400 text-xs uppercase tracking-wider">Subject</span>
            <h2 className="text-lg font-semibold text-neutral-200">
              {data.followUpDraft.subject}
            </h2>
          </div>
          <div className="text-neutral-300 text-sm leading-relaxed whitespace-pre-line font-mono text-xs">
            {data.followUpDraft.body}
          </div>
          <div className="mt-4 flex items-center gap-2 text-neutral-500 text-xs">
            <span className="font-mono">Tone:</span>
            <span>{data.followUpDraft.tone}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-neutral-500 text-xs">
            <span className="font-mono">Generated:</span>
            <span>{data.followUpDraft.generatedAt}</span>
          </div>
        </section>

        {/* Action items */}
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 mb-8">
          <h3 className="text-sm font-semibold text-neutral-300 mb-4">
            Action items ({data.followUpDraft.actionItems.length})
          </h3>
          <ul className="space-y-2">
            {data.followUpDraft.actionItems.map((action: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-neutral-400 text-sm">
                <span className="text-neutral-600">{i + 1}.</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Review flags */}
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 mb-8">
          <h3 className="text-sm font-semibold text-neutral-300 mb-4">
            Review flags
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">
                Requires human verification
              </div>
              <div className="text-sm text-neutral-300">
                {data.requiresHumanVerification.length} item(s)
              </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-neutral-500 text-xs uppercase tracking-wider mb-2">
                Flagged for review
              </div>
              <div className="text-sm text-neutral-300">
                {data.flaggedForReview.length} item(s)
              </div>
            </div>
          </div>
        </section>

        {/* No send button — explicit absence */}
        <div className="rounded-lg border border-neutral-700 bg-neutral-900/30 p-6">
          <h3 className="text-sm font-semibold text-neutral-300 mb-3">
            No outbound actions available
          </h3>
          <p className="text-neutral-500 text-sm mb-4">
            This draft has no send, dispatch, or mutate capability. The
            follow-up draft type intentionally excludes all outbound methods.
            A human must copy this draft externally if they wish to use it.
          </p>
          <div className="flex items-center gap-2 text-neutral-500 text-xs">
            <span className="w-2 h-2 rounded-full bg-neutral-600"></span>
            <span>Send: disabled</span>
            <span className="text-neutral-700">|</span>
            <span>Dispatch: disabled</span>
            <span className="text-neutral-700">|</span>
            <span>Mutate: disabled</span>
          </div>
        </div>
      </div>
    </main>
  );
}
