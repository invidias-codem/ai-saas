import { Metadata } from 'next';
import Link from 'next/link';
import { CLIInstructionCard } from '@/components/weaver/cli-instruction-card';

export const metadata: Metadata = {
  title: 'Weaver — Lattice AI',
  description: 'Turn requirements into durable orchestration plans. Terminal-native, local-first execution.',
};

export default function WeaverPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-4xl px-6 py-24">
        <h1 className="text-4xl font-bold tracking-tight">Weaver</h1>
        <p className="mt-4 text-lg text-neutral-400">
          The structural reasoning agent. Turns raw requirements into durable plans
          that execute directly in your terminal.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
            <h2 className="text-xl font-semibold">Plan synthesis</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Decompose code, docs, and requirements into executable steps with
              idempotency guarantees.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
            <h2 className="text-xl font-semibold">Local-first execution</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Runs in an isolated sandbox with strict timeout and buffer caps.
              No cloud lock-in.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
            <h2 className="text-xl font-semibold">Traceable</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Every step carries W3C trace context and Langfuse correlation for
              full observability.
            </p>
          </div>
        </div>

        <div className="mt-12 flex items-center gap-4">
          <Link
            href="/weaver/onboarding"
            className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-neutral-900"
          >
            Get started
          </Link>
          <Link
            href="/docs"
            className="rounded-md border border-neutral-700 px-5 py-3 text-sm font-semibold text-neutral-300"
          >
            Read the docs
          </Link>
        </div>

        <div className="mt-16">
          <CLIInstructionCard />
        </div>
      </section>
    </main>
  );
}
