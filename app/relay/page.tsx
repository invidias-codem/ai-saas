export default function RelayPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight">Relay</h1>
        <p className="mt-4 text-neutral-400">
          Internal workspace agent. Monitor durable workflows, routing telemetry,
          and Langfuse trace health.
        </p>

        <nav className="mt-8 flex gap-4 text-sm">
          <a href="/relay/routing" className="text-neutral-300 underline">
            Routing telemetry
          </a>
          <a href="/relay/workflows" className="text-neutral-300 underline">
            Workflows
          </a>
        </nav>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
            <h2 className="text-xl font-semibold">Durable engine</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Inspect running, paused, and failed workflows with idempotency keys.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
            <h2 className="text-xl font-semibold">Contextual bandit</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Audit routing decisions, intent confidence, and model selection
              heuristics.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6">
            <h2 className="text-xl font-semibold">Trace health</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Langfuse and UDIF audit emission status with error rates and
              latency.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
