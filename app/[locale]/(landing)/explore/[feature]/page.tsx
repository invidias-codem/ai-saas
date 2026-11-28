"use client";

import Link from "next/link";
import { useParams, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFeature } from "@/components/explore/explore-config";
import { ExploreDemo } from "@/components/explore/ExploreDemo";

export default function ExploreFeaturePage() {
    const params = useParams<{ feature: string }>();
    const feature = getFeature(params.feature);

    if (!feature) {
        notFound();
    }

    const Icon = feature.icon;

    return (
        <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
            <Link
                href="/explore"
                className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" /> All capabilities
            </Link>

            <div className="mb-8 flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="rounded-xl bg-primary/10 p-3">
                    <Icon className="h-7 w-7 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{feature.name}</h1>
                    <p className="text-muted-foreground">{feature.tagline}</p>
                </div>
                {feature.tier === "premium" ? (
                    <span className="rounded-full sm:ml-auto bg-action/12 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-copper-text">
                        Premium
                    </span>
                ) : (
                    <span className="rounded-full sm:ml-auto bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
                        Free
                    </span>
                )}
            </div>

            <p className="mb-8 max-w-2xl text-muted-foreground">{feature.description}</p>

            <ExploreDemo feature={feature} />

            <div className="mt-10 rounded-2xl border border-border bg-card/60 p-6 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                    Ready to make it yours? Sign in and your workspace intelligence carries the context forward.
                </p>
                <Link href={`/sign-up?redirect_url=/${feature.slug}`} className="inline-flex min-h-11 items-center rounded-full bg-action px-5 py-2.5 text-sm font-semibold text-action-foreground transition-colors hover:bg-action-hover">
                    Get started <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                </Link>
            </div>
        </main>
    );
}
