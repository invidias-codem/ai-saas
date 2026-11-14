"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { EXPLORE_FEATURES } from "@/components/explore/explore-config";

export default function ExplorePage() {
    return (
        <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
                Explore the platform
            </div>
            <h1 className="mb-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
                See how Lattice OS thinks
            </h1>
            <p className="mb-10 max-w-2xl text-lg text-muted-foreground">
                Browse the capabilities — conversation, memory, code, and the specialized extensions —
                without signing in. When you&apos;re ready to go deeper, workspace intelligence picks up where you left off.
            </p>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {EXPLORE_FEATURES.map((f) => {
                    const Icon = f.icon;
                    return (
                        <Link
                            key={f.slug}
                            href={`/explore/${f.slug}`}
                            className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 transition duration-200 hover:border-primary hover:bg-chrome"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <div className="rounded-xl bg-primary/10 p-2.5">
                                    <Icon className="h-6 w-6 text-primary" />
                                </div>
                                {f.tier === "premium" ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-action/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-copper-text">
                                        <Lock className="h-3 w-3" /> Premium
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                                        Free
                                    </span>
                                )}
                            </div>
                            <h3 className="text-lg font-semibold">{f.name}</h3>
                            <p className="mb-1 text-sm text-muted-foreground">{f.tagline}</p>
                            <p className="text-sm text-muted-foreground">{f.description}</p>
                            <span className="mt-4 inline-flex items-center text-sm font-semibold text-foreground group-hover:text-primary">
                                Explore <ArrowRight className="ml-1 h-4 w-4" />
                            </span>
                        </Link>
                    );
                })}
            </div>
        </main>
    );
}
