import { Metadata } from 'next';
import Link from 'next/link';
import { CLIInstructionCard } from '@/components/weaver/cli-instruction-card';

export const metadata: Metadata = {
  title: 'Onboard Weaver — Lattice AI',
  description: 'Generate your CLI access token and start weaving.',
};

export default function WeaverOnboardingPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Onboard to Weaver</h1>
        <p className="mt-4 text-neutral-400">
          Authenticate to receive a CLI access token. Paste it into your terminal
          to start weaving.
        </p>

        <div className="mt-10 rounded-lg border border-neutral-800 bg-neutral-900/40 p-8">
          <ol className="space-y-4 text-sm text-neutral-300">
            <li>1. Install the CLI: <code className="text-neutral-100">npm install -g lattice-cli</code></li>
            <li>
              2. Authenticate:{' '}
              <code className="text-neutral-100">lattice-cli auth --token YOUR_TOKEN</code>
            </li>
            <li>3. Run your first weave: <code className="text-neutral-100">lattice-cli weaver &quot;map the dependencies in /lib&quot;</code></li>
          </ol>

          <div className="mt-8">
            <CLIInstructionCard />
          </div>
        </div>

        <div className="mt-10">
          <Link href="/weaver" className="text-sm text-neutral-400 underline">
            ← Back to Weaver
          </Link>
        </div>
      </section>
    </main>
  );
}
