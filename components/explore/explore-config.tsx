"use client";

import {
    MessageSquare,
    Brain,
    Code2,
    Sparkles,
    Image as ImageIcon,
    Radio,
    Lock,
    type LucideIcon,
} from "lucide-react";

export type FeatureTier = "free" | "premium";

export interface ExploreFeature {
    slug: string;
    name: string;
    tagline: string;
    description: string;
    icon: LucideIcon;
    tier: FeatureTier;
    /** Short sample payload rendered read-only in the demo view. */
    demoKind: "conversation" | "memory" | "code" | "expert" | "media" | "telemetry";
}

export const EXPLORE_FEATURES: ExploreFeature[] = [
    {
        slug: "conversation",
        name: "Weaver Conversation",
        tagline: "Memory-native multi-model chat",
        description:
            "Talk to Weaver across Gemini, Claude, and DeepSeek. Every session compounds into structured memory the next one can use.",
        icon: MessageSquare,
        tier: "free",
        demoKind: "conversation",
    },
    {
        slug: "memory",
        name: "Memory Center",
        tagline: "The shared intelligence substrate",
        description:
            "Inspect the knowledge graph, fact extractions, and task state that persist across sessions and power routing.",
        icon: Brain,
        tier: "free",
        demoKind: "memory",
    },
    {
        slug: "code",
        name: "Code Builder",
        tagline: "UCOL agentic debate loop",
        description:
            "Gemini plans, Claude codes, Gemini reviews. A deterministic multi-agent loop that ships production-ready components.",
        icon: Code2,
        tier: "free",
        demoKind: "code",
    },
    {
        slug: "expert",
        name: "Chameleon Consultant",
        tagline: "Rentable, domain-specialized intelligence",
        description:
            "Weaver packaged as a tailored consultant for a vertical — deep, specific expertise on demand.",
        icon: Sparkles,
        tier: "premium",
        demoKind: "expert",
    },
    {
        slug: "media",
        name: "Media Studio",
        tagline: "High-compute generation extensions",
        description:
            "Image, music, and video generation wired into your workspace context. Specialized, compute-heavy extensions.",
        icon: ImageIcon,
        tier: "premium",
        demoKind: "media",
    },
    {
        slug: "telemetry",
        name: "Sovereign Telemetry",
        tagline: "Observable intelligence",
        description:
            "Trace every routing decision, fact extraction, and agent dispatch. Audit-grade visibility into the substrate.",
        icon: Radio,
        tier: "premium",
        demoKind: "telemetry",
    },
];

export function getFeature(slug: string): ExploreFeature | undefined {
    return EXPLORE_FEATURES.find((f) => f.slug === slug);
}

/* ------------------------------------------------------------------ */
/* Sample / mock payloads — NO user data, NO network calls.            */
/* These exist only so the tour can render a realistic read-only view. */
/* ------------------------------------------------------------------ */

export const SAMPLE_CONVERSATION = [
    { role: "user", text: "Summarize our Q3 memory-bank growth and flag any contradiction with the world model." },
    {
        role: "weaver",
        text: "Q3 added 1,842 structured facts (+38% QoQ). One soft contradiction: the world model tags 'Project Helix' as archived, but three October sessions reference it as active. I've queued that edge for human review rather than auto-resolving it.",
    },
    { role: "user", text: "Good. Draft the reconciliation note." },
    {
        role: "weaver",
        text: "Drafted: 'Project Helix status divergence (archived vs. active) — recommend a single source-of-truth owner. Pending your confirmation before the graph is updated.'",
    },
];

export const SAMPLE_MEMORY_NODES = [
    { id: "n1", label: "Project Helix", type: "project", x: 20, y: 30 },
    { id: "n2", label: "UCOL routing", type: "capability", x: 55, y: 18 },
    { id: "n3", label: "Q3 facts +38%", type: "metric", x: 70, y: 55 },
    { id: "n4", label: "World model v3", type: "system", x: 35, y: 70 },
    { id: "n5", label: "Chameleon Consultant", type: "product", x: 80, y: 80 },
];

export const SAMPLE_MEMORY_EDGES = [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n4", to: "n1" },
    { from: "n2", to: "n5" },
    { from: "n4", to: "n3" },
];

export const SAMPLE_CODE_LOOP = [
    { stage: "Plan", agent: "Gemini", text: "Decompose: scaffold API route, add Zod schema, write handler, add tests." },
    { stage: "Code", agent: "Claude", text: "Implemented route.ts with Zod-validated body and idempotent insert." },
    { stage: "Review", agent: "Gemini", text: "One issue: missing rate-limit header. Approved with that note." },
];

export const SAMPLE_EXPERT = {
    vertical: "Healthcare Ops",
    blurb:
        "A Chameleon Consultant tuned on your SOPs, payer rules, and audit history. Answers as a domain specialist, not a general model.",
    capabilities: ["SOP adherence checks", "Payer-rule mapping", "Audit-ready summaries"],
};

export const SAMPLE_MEDIA = [
    { kind: "Image", prompt: "Isometric lattice node graph, cyan-to-magenta gradient, 4k" },
    { kind: "Music", prompt: "Ambient focus loop, 120bpm, subtle arpeggios" },
    { kind: "Video", prompt: "Animated knowledge graph forming, 8s" },
];

export const SAMPLE_TELEMETRY = [
    { metric: "UCOL routed queries", value: "100%", detail: "0 P95 latency increase" },
    { metric: "Facts extracted (30d)", value: "12,408", detail: "append-only, temporal" },
    { metric: "Agent dispatches", value: "3,921", detail: "Gemini / Claude / DeepSeek" },
];
