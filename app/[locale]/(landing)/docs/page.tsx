"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
    ArrowRight,
    BookOpen,
    Boxes,
    Shield,
    Wrench,
    FileCode2,
    GitBranch,
    CheckCircle2,
    ServerCog,
    BrainCircuit,
} from "lucide-react";

const docSections = [
    {
        id: "overview",
        title: "Overview",
        icon: BookOpen,
        description: "Start here for the high-level platform story and technology transparency.",
        items: [
            {
                title: "Documentation Index",
                path: "docs/README.md",
                description: "The backbone index for the repository documentation system.",
            },
            {
                title: "Technology Transparency",
                path: "docs/overview/technology-transparency.md",
                description: "Explicit explanation of the stack, hosting surfaces, AI/runtime layers, and major product boundaries.",
            },
            {
                title: "SEO Strategy",
                path: "docs/overview/seo-strategy.md",
                description: "How Lattice OS should talk about memory-native AI, hybrid inference, and workspace intelligence for search and discovery.",
            },
        ],
    },
    {
        id: "architecture",
        title: "Architecture",
        icon: Boxes,
        description: "Understand how Lattice OS is structured and where the platform is headed.",
        items: [
            {
                title: "System Architecture",
                path: "docs/architecture/system-architecture.md",
                description: "High-level system layers, trust zones, and request flow." ,
            },
            {
                title: "Runtime Mode Routing",
                path: "docs/architecture/runtime-mode-routing.md",
                description: "How the server resolves effective runtime behavior from context instead of trusting client toggles.",
            },
            {
                title: "Memory and Context Architecture",
                path: "docs/architecture/memory-and-context-architecture.md",
                description: "Prepared context, layered memory direction, and why raw history is not enough.",
            },
            {
                title: "Workspace and Operating Profile Model",
                path: "docs/architecture/workspace-operating-profile-model.md",
                description: "Why workspace is the primary container and operating profile is the behavior-shaping layer.",
            },
            {
                title: "Retrieval and Graph Strategy",
                path: "docs/architecture/retrieval-and-graph-strategy.md",
                description: "How retrieval and future graph-aware systems support structured context assembly.",
            },
        ],
    },
    {
        id: "security",
        title: "Security",
        icon: Shield,
        description: "Make route visibility, trust boundaries, and authority models explicit.",
        items: [
            {
                title: "Public Routes",
                path: "docs/security/public-routes.md",
                description: "Which routes are intended to remain public and how route gating is actually enforced.",
            },
            {
                title: "Trust Boundaries",
                path: "docs/security/trust-boundaries.md",
                description: "The platform’s major trust zones across public users, authenticated users, backend jobs, integrations, and operators.",
            },
        ],
    },
    {
        id: "operations",
        title: "Operations",
        icon: Wrench,
        description: "Operational discipline for deployment, verification, and debugging in a multi-surface platform.",
        items: [
            {
                title: "Truth Surfaces",
                path: "docs/operations/truth-surfaces.md",
                description: "How to choose the right evidence source when code, CI, deploy logs, and runtime disagree.",
            },
            {
                title: "Deployment",
                path: "docs/operations/deployment.md",
                description: "How code moves from repo state to live runtime and what to verify along the way.",
            },
            {
                title: "Route Verification Checklist",
                path: "docs/operations/route-verification-checklist.md",
                description: "Checklist for validating public, protected, localized, and API-dependent routes.",
            },
            {
                title: "Incident Debugging",
                path: "docs/operations/incident-debugging.md",
                description: "A practical method for classifying incidents, choosing truth surfaces, and narrowing failure boundaries.",
            },
        ],
    },
    {
        id: "reference",
        title: "Reference",
        icon: FileCode2,
        description: "Concrete developer-facing reference material for APIs, environment configuration, and repo navigation.",
        items: [
            {
                title: "API Reference",
                path: "docs/reference/api-reference.md",
                description: "Human-readable map of important API surfaces, public/protected boundaries, and debugging notes.",
            },
            {
                title: "Environment Variables",
                path: "docs/reference/environment-variables.md",
                description: "Public vs server-only configuration surfaces and the major variables that shape runtime behavior.",
            },
            {
                title: "Request and Response Examples",
                path: "docs/reference/request-response-examples.md",
                description: "Concrete payload examples for important API routes.",
            },
            {
                title: "Source File Map",
                path: "docs/reference/source-file-map.md",
                description: "Where important route, runtime, auth, and subsystem files live in the repository.",
            },
        ],
    },
    {
        id: "decisions",
        title: "Decisions",
        icon: GitBranch,
        description: "Architectural decision records that capture why the platform evolved the way it did.",
        items: [
            {
                title: "ADR Index",
                path: "docs/decisions/README.md",
                description: "Entry point for the architecture decision record set.",
            },
            {
                title: "Current ADR Set",
                path: "docs/decisions/",
                description: "Covers workspace-first architecture, server-resolved runtime routing, prepared context, public/authenticated boundary separation, deploy truth vs runtime truth, and more.",
            },
        ],
    },
];

const audiences = [
    {
        title: "Developers",
        description: "Use the architecture, reference, and source-file map docs to understand where behavior lives and how the major subsystems fit together.",
    },
    {
        title: "Operators",
        description: "Use truth surfaces, deployment, route verification, and incident debugging docs to diagnose live-system issues more reliably.",
    },
    {
        title: "Reviewers & Collaborators",
        description: "Use technology transparency, trust boundaries, and ADRs to understand the real platform model without digging blindly through the whole codebase.",
    },
];

export default function DocsPage() {
    return (
        <div className="bg-[#FAF9F7] dark:bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative text-slate-900 dark:text-white">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
            </div>

            <header className="relative z-10 py-6 px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full border-b border-slate-200 dark:border-white/5 bg-[#FAF9F7] dark:bg-[#111827]/80 backdrop-blur-md sticky top-0">
                <Link href="/" className="flex items-center gap-2">
                    <div className="relative w-8 h-8">
                        <Image src="/Genie.png" alt="Lattice OS logo" fill className="object-cover" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight">Lattice OS</span>
                </Link>
                <div className="flex items-center gap-x-4">
                    <Link href="/support" className="text-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition hidden sm:block">
                        Support
                    </Link>
                    <Link href="/dashboard">
                        <Button variant="ghost" className="text-slate-900 dark:text-white hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full">
                            Log in
                        </Button>
                    </Link>
                    <Link href="/dashboard">
                        <Button className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 rounded-full font-semibold">
                            Get Started
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto w-full px-6 py-12 flex flex-col md:flex-row gap-12">
                <aside className="w-full md:w-72 flex-shrink-0 hidden md:block">
                    <div className="sticky top-32 space-y-8">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-4">Documentation</h3>
                            <ul className="space-y-3 border-l border-slate-200 dark:border-white/10">
                                {docSections.map((section, index) => (
                                    <li key={section.id}>
                                        <a
                                            href={`#${section.id}`}
                                            className={`block pl-4 transition ${index === 0 ? "text-purple-500 dark:text-purple-400 border-l border-purple-500 -ml-px" : "text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"}`}
                                        >
                                            {section.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-4">Use This Docs Set For</h3>
                            <ul className="space-y-3 border-l border-slate-200 dark:border-white/10">
                                <li className="block pl-4 text-slate-500 dark:text-gray-400">Lattice OS platform orientation</li>
                                <li className="block pl-4 text-slate-500 dark:text-gray-400">Runtime behavior clarity</li>
                                <li className="block pl-4 text-slate-500 dark:text-gray-400">Operational debugging</li>
                                <li className="block pl-4 text-slate-500 dark:text-gray-400">Security boundary review</li>
                            </ul>
                        </div>
                    </div>
                </aside>

                <div className="flex-grow max-w-4xl space-y-16">
                    <section id="hero" className="scroll-mt-32">
                        <div className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-700 dark:text-purple-200 mb-6">
                            <BookOpen className="w-3 h-3 mr-2" />
                            Documentation Hub
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:to-gray-500">
                            Platform docs for how Genie AI actually works
                        </h1>
                        <p className="text-xl text-slate-600 dark:text-gray-400 leading-relaxed mb-8 max-w-3xl">
                            This docs surface is designed to make Genie AI legible as a real platform — not just a landing page with vague AI copy. It maps the architecture, runtime behavior, security boundaries, deployment model, and operational reference surfaces that shape the product.
                        </p>

                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="p-6 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                                <BrainCircuit className="w-8 h-8 text-purple-500 dark:text-purple-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Architecture-first</h3>
                                <p className="text-sm text-slate-600 dark:text-gray-400">Explains workspace, context, retrieval, runtime routing, and system boundaries without hand-wavy abstractions.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                                <Shield className="w-8 h-8 text-blue-500 dark:text-blue-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Security-aware</h3>
                                <p className="text-sm text-slate-600 dark:text-gray-400">Makes route visibility, trust boundaries, and operational assumptions explicit instead of implicit.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                                <ServerCog className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Operationally useful</h3>
                                <p className="text-sm text-slate-600 dark:text-gray-400">Documents truth surfaces, deployment reality, debugging discipline, and concrete reference material for the live system.</p>
                            </div>
                        </div>
                    </section>

                    <section id="how-to-use" className="scroll-mt-32 border-t border-slate-200 dark:border-white/10 pt-16">
                        <h2 className="text-3xl font-bold mb-8">How to use this docs set</h2>
                        <div className="grid md:grid-cols-3 gap-6">
                            {audiences.map((audience) => (
                                <div key={audience.title} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 p-6">
                                    <h3 className="text-lg font-semibold mb-3">{audience.title}</h3>
                                    <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">{audience.description}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {docSections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <section key={section.id} id={section.id} className="scroll-mt-32 border-t border-slate-200 dark:border-white/10 pt-16">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/10">
                                        <Icon className="w-7 h-7 text-slate-800 dark:text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-bold">{section.title}</h2>
                                        <p className="text-slate-600 dark:text-gray-400 mt-2">{section.description}</p>
                                    </div>
                                </div>

                                <div className="grid gap-4">
                                    {section.items.map((item) => (
                                        <div key={`${section.id}-${item.title}`} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-white/5 p-6">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                                                    <p className="text-slate-600 dark:text-gray-400 leading-relaxed mb-4">{item.description}</p>
                                                    <code className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-300 break-all">
                                                        {item.path}
                                                    </code>
                                                </div>
                                                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-1" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        );
                    })}

                    <section className="border-t border-slate-200 dark:border-white/10 pt-16 pb-16">
                        <div className="rounded-2xl bg-blue-600/10 border border-blue-500/20 p-8 text-center">
                            <h2 className="text-2xl font-bold mb-4">Need help with the platform or docs?</h2>
                            <p className="text-slate-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
                                If you&apos;re trying to understand a route, runtime behavior, deployment issue, or integration surface that isn&apos;t clear yet, use the support page and we can tighten the docs further.
                            </p>
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <Link href="/support">
                                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                        Contact Support
                                    </Button>
                                </Link>
                                <Link href="/dashboard">
                                    <Button variant="outline" className="border-slate-300 dark:border-white/20 hover:bg-slate-100 dark:hover:bg-white/5">
                                        Open Product <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            <footer className="py-10 border-t border-slate-200 dark:border-white/10 bg-[#FAF9F7] dark:bg-[#111827]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="relative w-6 h-6">
                                <Image src="/Genie.png" alt="Lattice OS logo" fill className="object-cover" />
                            </div>
                            <span className="text-lg font-bold text-slate-900 dark:text-white">Lattice OS</span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-gray-400">
                            <Link href="/privacy" className="hover:text-slate-900 dark:hover:text-white transition">Privacy Policy</Link>
                            <Link href="/support" className="hover:text-slate-900 dark:hover:text-white transition">Support</Link>
                            <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-white transition">Dashboard</Link>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-slate-200 dark:border-white/10 text-center">
                        <p className="text-slate-500 dark:text-gray-500 text-sm">
                            © {new Date().getFullYear()} Genie AI. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
