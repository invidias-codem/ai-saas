import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide, GUIDE_IDS, GUIDES } from "@/lib/beta-guides";

export const dynamic = "force-static";

export function generateStaticParams() {
  return GUIDE_IDS.map((guideId) => ({ guideId }));
}

type PageProps = {
  params: Promise<{ locale: string; guideId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { guideId } = await params;
  const guide = getGuide(guideId);
  if (!guide) return { title: "Not found" };
  return {
    title: `${guide.title} · Lattice OS Beta`,
    description: guide.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function BetaGuidePage({ params }: PageProps) {
  const { guideId } = await params;
  const guide = getGuide(guideId);
  if (!guide) notFound();

  const otherGuides = GUIDE_IDS.filter((id) => id !== guideId).map((id) => GUIDES[id]);

  return (
    <article className="mx-auto max-w-3xl px-5 py-16 text-foreground">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary-600">
        {guide.eyebrow}
      </p>
      <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{guide.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{guide.subtitle}</p>

      <dl className="mt-8 grid gap-4 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-muted-foreground">Who this is for</dt>
          <dd className="mt-1">{guide.persona}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Time</dt>
          <dd className="mt-1">{guide.duration}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">You'll walk away with</dt>
          <dd className="mt-1">{guide.outcome}</dd>
        </div>
      </dl>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Before you start</h2>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {guide.prerequisites.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-primary-600">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 space-y-10">
        {guide.steps.map((step) => (
          <div key={step.title} className="border-l-2 border-primary-500/30 pl-5">
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">
              {step.body}
            </p>
            {step.command && (
              <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-black/5 p-4 text-sm dark:bg-white/5">
                <code>{step.command}</code>
              </pre>
            )}
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Continue with another track</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {otherGuides.map((g) => (
            <Link
              key={g.id}
              href={`/beta/${g.id}`}
              className="group rounded-lg border border-border p-4 transition hover:border-primary-500/50 hover:bg-primary-500/5"
            >
              <p className="text-xs uppercase tracking-widest text-primary-600">{g.eyebrow}</p>
              <p className="mt-1 font-semibold group-hover:text-primary-600">{g.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{g.duration}</p>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
