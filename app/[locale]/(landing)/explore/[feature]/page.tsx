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
        <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative text-foreground">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
            </div>

            <main className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28 md:pt-32">
                <Link
                    href="/explore"
                    className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" /> All capabilities
                </Link>

                <div className="mb-8 flex items-center gap-4">
                    <div className="rounded-xl bg-primary/10 p-3">
                        <Icon className="h-7 w-7 text-purple-500" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{feature.name}</h1>
                        <p className="text-purple-600 dark:text-purple-400">{feature.tagline}</p>
                    </div>
                    {feature.tier === "premium" ? (
                        <span className="ml-auto rounded-full bg-purple-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-600">
                            Premium
                        </span>
                    ) : (
                        <span className="ml-auto rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">
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
                    <Link href={`/sign-up?redirect_url=/${feature.slug}`}>
                        <span className="inline-flex items-center rounded-full bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700">
                            Get started <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                        </span>
                    </Link>
                </div>
            </main>
        </div>
    );
}
