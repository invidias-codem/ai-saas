"use client";

import Link from "next/link";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import {
    SAMPLE_CONVERSATION,
    SAMPLE_MEMORY_EDGES,
    SAMPLE_MEMORY_NODES,
    SAMPLE_CODE_LOOP,
    SAMPLE_EXPERT,
    SAMPLE_MEDIA,
    SAMPLE_TELEMETRY,
    type ExploreFeature,
} from "./explore-config";

function UnlockCta({ feature }: { feature: ExploreFeature }) {
    // "Workspace intelligence" framing per the product vision.
    return (
        <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-200">
                <Lock className="h-4 w-4" />
                <span className="text-sm font-semibold">Premium extension</span>
            </div>
            <p className="text-sm text-muted-foreground">
                {feature.name} is part of the high-compute, specialized Lattice OS extensions.
                Sign in to activate workspace intelligence and unlock it.
            </p>
            <Link href={`/sign-up?redirect_url=/${feature.slug}`}>
                <span className="inline-flex items-center rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700">
                    Unlock with workspace intelligence <ArrowRight className="ml-2 h-4 w-4" />
                </span>
            </Link>
        </div>
    );
}

function ConversationDemo() {
    return (
        <div className="space-y-4">
            {SAMPLE_CONVERSATION.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                        className={
                            m.role === "user"
                                ? "max-w-[80%] rounded-2xl bg-purple-600 px-4 py-3 text-sm text-white"
                                : "max-w-[80%] rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground"
                        }
                    >
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {m.role === "user" ? "You" : "Weaver"}
                        </p>
                        {m.text}
                    </div>
                </div>
            ))}
            <div className="rounded-xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
                Sign in to continue the conversation — memory carries forward.
            </div>
        </div>
    );
}

function MemoryDemo() {
    return (
        <div className="space-y-4">
            <div className="relative h-64 w-full rounded-2xl border border-border bg-card">
                <svg viewBox="0 0 100 100" className="h-full w-full">
                    {SAMPLE_MEMORY_EDGES.map((e, i) => {
                        const a = SAMPLE_MEMORY_NODES.find((n) => n.id === e.from)!;
                        const b = SAMPLE_MEMORY_NODES.find((n) => n.id === e.to)!;
                        return (
                            <line
                                key={i}
                                x1={a.x}
                                y1={a.y}
                                x2={b.x}
                                y2={b.y}
                                stroke="currentColor"
                                strokeOpacity={0.25}
                                strokeWidth={0.5}
                            />
                        );
                    })}
                    {SAMPLE_MEMORY_NODES.map((n) => (
                        <g key={n.id}>
                            <circle cx={n.x} cy={n.y} r={3.2} className="fill-purple-500" />
                            <text x={n.x} y={n.y - 5} textAnchor="middle" className="fill-foreground text-[3px]">
                                {n.label}
                            </text>
                        </g>
                    ))}
                </svg>
            </div>
            <p className="text-xs text-muted-foreground">
                Read-only sample of the knowledge graph. Live graph reflects your own sessions and facts.
            </p>
        </div>
    );
}

function CodeDemo() {
    return (
        <div className="space-y-3">
            {SAMPLE_CODE_LOOP.map((s, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {s.stage}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.agent}</span>
                    </div>
                    <p className="text-sm text-foreground">{s.text}</p>
                </div>
            ))}
        </div>
    );
}

function ExpertDemo() {
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5">
                <div className="mb-2 flex items-center gap-2 text-purple-700 dark:text-purple-200">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-semibold">{SAMPLE_EXPERT.vertical}</span>
                </div>
                <p className="text-sm text-muted-foreground">{SAMPLE_EXPERT.blurb}</p>
                <ul className="mt-3 space-y-1 text-sm text-foreground">
                    {SAMPLE_EXPERT.capabilities.map((c) => (
                        <li key={c} className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" /> {c}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function MediaDemo() {
    return (
        <div className="space-y-3">
            {SAMPLE_MEDIA.map((m, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {m.kind}
                    </span>
                    <span className="text-sm text-muted-foreground">{m.prompt}</span>
                </div>
            ))}
        </div>
    );
}

function TelemetryDemo() {
    return (
        <div className="space-y-3">
            {SAMPLE_TELEMETRY.map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                    <div>
                        <p className="text-sm font-semibold text-foreground">{t.metric}</p>
                        <p className="text-xs text-muted-foreground">{t.detail}</p>
                    </div>
                    <span className="text-lg font-bold text-purple-600">{t.value}</span>
                </div>
            ))}
        </div>
    );
}

export function ExploreDemo({ feature }: { feature: ExploreFeature }) {
    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card/60 p-6">
                {feature.demoKind === "conversation" && <ConversationDemo />}
                {feature.demoKind === "memory" && <MemoryDemo />}
                {feature.demoKind === "code" && <CodeDemo />}
                {feature.demoKind === "expert" && <ExpertDemo />}
                {feature.demoKind === "media" && <MediaDemo />}
                {feature.demoKind === "telemetry" && <TelemetryDemo />}
            </div>
            {feature.tier === "premium" && <UnlockCta feature={feature} />}
        </div>
    );
}
