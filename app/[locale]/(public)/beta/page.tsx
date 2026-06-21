import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES, GUIDE_IDS } from "@/lib/beta-guides";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Lattice OS · Beta Tracks",
  description:
    "Pick a track to start your Lattice OS beta onboarding — Quick Start, Developer, Enterprise, or Privacy & Compliance.",
  robots: { index: false, follow: false },
};

export default function BetaIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 text-foreground">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary-600">
        Lattice OS · Beta Onboarding
      </p>
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
        Pick your track.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Four guided paths through Lattice OS, each tailored to a different kind of tester.
        Pick whichever fits what you signed up for — you can switch between them at any time.
      </p>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {GUIDE_IDS.map((id) => {
          const g = GUIDES[id];
          return (
            <Link
              key={id}
              href={`/beta/${id}`}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition hover:border-primary-500/50 hover:bg-primary-500/5"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-600">
                {g.eyebrow}
              </p>
              <h2 className="mt-3 text-2xl font-bold group-hover:text-primary-600">
                {g.title}
              </h2>
              <p className="mt-2 text-muted-foreground">{g.persona}</p>
              <dl className="mt-4 flex gap-6 text-xs text-muted-foreground">
                <div>
                  <dt className="font-semibold">Time</dt>
                  <dd>{g.duration}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Outcome</dt>
                  <dd>{g.outcome}</dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        Already know who you are?{" "}
        <Link href="/beta/start" className="underline hover:text-foreground">
          Jump to Quick Start →
        </Link>
      </p>
    </div>
  );
}
