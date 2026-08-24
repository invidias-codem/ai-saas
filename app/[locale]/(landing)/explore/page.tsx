"use client";

import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { EXPLORE_FEATURES } from "@/components/explore/explore-config";

export default function ExplorePage() {
    return (
        <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative text-foreground">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
            </div>

            <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28 md:pt-32">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-200">
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
                                className="group relative flex flex-col rounded-2xl border border-border bg-card p-6 transition hover:border-purple-500/50 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.25)]"
                            >
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="rounded-xl bg-primary/10 p-2.5">
                                        <Icon className="h-6 w-6 text-purple-500" />
                                    </div>
                                    {f.tier === "premium" ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-600">
                                            <Lock className="h-3 w-3" /> Premium
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                                            Free
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-semibold">{f.name}</h3>
                                <p className="mb-1 text-sm text-purple-600 dark:text-purple-400">{f.tagline}</p>
                                <p className="text-sm text-muted-foreground">{f.description}</p>
                                <span className="mt-4 inline-flex items-center text-sm font-semibold text-foreground group-hover:text-purple-500">
                                    Explore <ArrowRight className="ml-1 h-4 w-4" />
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </main>
        </div>
    );
}
