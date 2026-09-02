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
    Rocket,
    Terminal,
    KeyRound,
    LockKeyhole,
    LifeBuoy,
    ExternalLink,
    type LucideIcon,
} from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";

type DocItem = {
    title: string;
    path: string;
    description: string;
    href?: string;
};

type DocSection = {
    id: string;
    title: string;
    icon: LucideIcon;
    description: string;
    items: DocItem[];
};

const GITHUB_REPO_URL = "https://github.com/invidias-codem/ai-saas";
const GITHUB_DOCS_URL = `${GITHUB_REPO_URL}/tree/main/docs`;

function githubUrlForPath(path: string) {
    if (path.startsWith("/")) return null;
    const target = path.endsWith("/") ? `tree/main/${path.slice(0, -1)}` : `blob/main/${path}`;
    return `${GITHUB_REPO_URL}/${target}`;
}

const onboardingPath = [
    {
        step: "01",
        title: "Pick the right track",
        description: "New testers should start with the beta track that matches their intent: quick evaluation, source build, enterprise rollout, or privacy/compliance review.",
        href: "/beta",
        cta: "Open beta tracks",
    },
    {
        step: "02",
        title: "Install the lattice CLI",
        description: "The CLI manages auth, license activation, Docker appliance deployment, preflight checks, logs, backups, and upgrades.",
        command: "curl -sL https://raw.githubusercontent.com/invidias-codem/ai-saas/main/scripts/lattice-cli/install.sh | bash\nlattice --version",
    },
    {
        step: "03",
        title: "Activate licensing and initialize",
        description: "V3 licenses are ed25519-signed and verified locally, so Enterprise features can unlock without a phone-home dependency.",
        command: "lattice license activate <lattice-v3-key>\nlattice deploy init --name beta --tier enterprise",
    },
    {
        step: "04",
        title: "Run preflight, deploy, then smoke test",
        description: "Deployment starts with Docker, Compose v2, resources, ports, disk, auth, and license checks. Finish by creating a workspace and verifying memory-aware chat.",
        command: "lattice deploy start --name beta\nlattice health check --instance beta",
        href: "/dashboard",
        cta: "Open your dashboard",
    },
];

const powerUserRecipes = [
    {
        title: "Self-hosted Docker appliance",
        icon: ServerCog,
        description: "Use the CLI and deployment docs when you need a single-server install with explicit data-residency control.",
        links: ["scripts/lattice-cli/README.md", "docs/operations/self-hosted-topology.md", "docs/operations/self-hosted-preflight-checklist.md"],
    },
    {
        title: "Air-gapped / regulated environment",
        icon: LockKeyhole,
        description: "Use local license verification, pre-loaded Docker images, no-egress configuration, and audit-oriented health evidence.",
        links: ["/beta/privacy", "scripts/lattice-cli/lattice_cli/crypto_license.py", "docs/security/trust-boundaries.md"],
    },
    {
        title: "Enterprise rollout",
        icon: KeyRound,
        description: "Understand workspace-as-project isolation, Enterprise feature gates, SSO/RBAC expectations, backup cadence, and rollback paths.",
        links: ["/beta/enterprise", "docs/operations/deployment-modes.md", "docs/reference/environment-variables.md"],
    },
    {
        title: "Debug a weird route or runtime issue",
        icon: LifeBuoy,
        description: "Start from truth surfaces, verify public/protected boundaries, then use request examples and source maps to find the owning code path.",
        links: ["docs/operations/truth-surfaces.md", "docs/operations/route-verification-checklist.md", "docs/reference/request-response-examples.md"],
    },
];

const docSections: DocSection[] = [
    {
        id: "overview",
        title: "Overview",
        icon: BookOpen,
        description: "Start here for the high-level platform story, technology transparency, and positioning.",
        items: [
            {
                title: "Documentation Index",
                path: "docs/README.md",
                description: "The backbone index for the repository documentation system and the best place to see what exists today.",
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
        id: "onboarding",
        title: "Onboarding",
        icon: Rocket,
        description: "Guided paths for beta testers, developers, enterprise evaluators, and privacy-focused teams.",
        items: [
            {
                title: "Beta Track Picker",
                path: "/beta",
                description: "Choose between Quick Start, Developer, Enterprise, and Privacy & Compliance onboarding paths.",
                href: "/beta",
            },
            {
                title: "Quick Start",
                path: "/beta/start",
                description: "15-minute path from CLI install to first workspace and first memory-aware conversation.",
                href: "/beta/start",
            },
            {
                title: "Developer Track",
                path: "/beta/dev",
                description: "Source builds, custom registries, CI deployment stubs, and standalone binary builds.",
                href: "/beta/dev",
            },
            {
                title: "Enterprise Track",
                path: "/beta/enterprise",
                description: "Licensing, workspace isolation, SSO/RBAC expectations, backups, health checks, upgrades, and rollback.",
                href: "/beta/enterprise",
            },
            {
                title: "Privacy & Compliance Track",
                path: "/beta/privacy",
                description: "Air-gapped deployment pattern for regulated environments where data cannot leave the network.",
                href: "/beta/privacy",
            },
        ],
    },
    {
        id: "cli-appliance",
        title: "CLI & Appliance",
        icon: Terminal,
        description: "Manage Lattice OS as an installable Docker appliance with local preflight checks and cryptographic licensing.",
        items: [
            {
                title: "lattice-cli Command Reference",
                path: "scripts/lattice-cli/README.md",
                description: "Install options, auth, deploy, health, upgrade, backup, restore, and configuration reference for lattice-cli v0.3.0.",
            },
            {
                title: "V3 Cryptographic Licensing",
                path: "scripts/lattice-cli/lattice_cli/crypto_license.py",
                description: "ed25519-signed license payloads with embedded public-key verification for offline-capable Enterprise activation.",
            },
            {
                title: "Self-Hosted Topology",
                path: "docs/operations/self-hosted-topology.md",
                description: "How the app, database, storage, auth, and optional workers fit together in self-hosted installs.",
            },
            {
                title: "Self-Hosted Preflight Checklist",
                path: "docs/operations/self-hosted-preflight-checklist.md",
                description: "The practical preflight and smoke-test checklist for deciding whether a fresh install is usable.",
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
                description: "High-level system layers, trust zones, and request flow.",
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
            {
                title: "License Verification Boundary",
                path: "scripts/lattice-cli/lattice_cli/crypto_license.py",
                description: "Power users can inspect the public-key verification path without exposing the private signing key.",
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
                title: "Deployment Modes",
                path: "docs/operations/deployment-modes.md",
                description: "Official business deployment modes and the recommended support order for self-hosted adoption.",
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
        title: "New users",
        description: "Start with the beta track picker, install the CLI, deploy locally, create a workspace, and verify the first memory-aware conversation.",
    },
    {
        title: "Developers",
        description: "Use the architecture, reference, CLI, and source-file map docs to understand where behavior lives and how the major subsystems fit together.",
    },
    {
        title: "Operators",
        description: "Use truth surfaces, deployment, preflight, route verification, and incident debugging docs to diagnose live-system issues more reliably.",
    },
    {
        title: "Power users",
        description: "Use the recipe cards to jump straight to niche flows: air-gapped deployments, custom registries, Enterprise rollout, backups, and rollback.",
    },
];

export default function DocsPage() {
    return (
        <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative text-foreground">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
            </div>

            <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-10 pt-24 sm:px-6 sm:pt-28 md:flex-row md:gap-12 md:px-10 md:py-12">
                <aside className="w-full md:w-72 flex-shrink-0 hidden md:block">
                    <div className="sticky top-32 space-y-8">
                        <div>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Documentation</h3>
                            <ul className="space-y-3 border-l border-border">
                                {docSections.map((section, index) => (
                                    <li key={section.id}>
                                        <a
                                            href={`#${section.id}`}
                                            className={`block pl-4 min-h-[44px] inline-flex items-center transition ${index === 0 ? "text-primary border-l-2 border-primary -ml-px" : "text-muted-foreground border-l border-transparent hover:text-foreground hover:border-border"}`}
                                        >
                                            {section.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Use This Docs Set For</h3>
                            <ul className="space-y-3 border-l border-border">
                                <li className="block pl-4 text-muted-foreground">First-run onboarding</li>
                                <li className="block pl-4 text-muted-foreground">Docker appliance installs</li>
                                <li className="block pl-4 text-muted-foreground">Enterprise and air-gap reviews</li>
                                <li className="block pl-4 text-muted-foreground">Operational debugging</li>
                                <li className="block pl-4 text-muted-foreground">Security boundary review</li>
                            </ul>
                        </div>
                    </div>
                </aside>

                <div className="w-full flex-grow space-y-10 md:max-w-4xl md:space-y-16">
                    <section id="hero" className="scroll-mt-32">
                        <div className="mb-5 inline-flex max-w-full items-start gap-2 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[11px] font-medium leading-snug text-purple-700 dark:text-purple-200 sm:items-center sm:rounded-full sm:text-xs">
                            <BookOpen className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 sm:mt-0" />
                            <span>Documentation Hub · Beta onboarding, CLI, appliance deployment</span>
                        </div>
                        <h1 className="mb-5 max-w-3xl bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-[2.35rem] font-bold leading-[1.04] tracking-tight text-transparent dark:from-white dark:via-slate-300 dark:to-slate-500 min-[390px]:text-[2.75rem] sm:text-5xl md:text-6xl">
                            Docs for onboarding, operating, and extending Lattice OS
                        </h1>
                        <p className="mb-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg md:text-xl md:leading-relaxed">
                            New users get a clear path from install to first memory-aware workspace. Power users get direct entry points for Docker appliance deployment, V3 licensing, air-gapped operation, Enterprise rollout, route verification, and incident debugging.
                        </p>

                        <div className="mb-6 grid gap-3 sm:mb-8 sm:flex sm:flex-wrap">
                            <Link href="/beta/start" className="w-full sm:w-auto">
                                <Button className="h-11 w-full rounded-full px-5 text-sm font-semibold sm:w-auto">
                                    Start Quick Onboarding <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                            <a href="#power-user-recipes" className="w-full sm:w-auto">
                                <Button variant="outline" className="h-11 w-full rounded-full border-border px-5 text-sm hover:bg-accent sm:w-auto">
                                    Power-User Recipes
                                </Button>
                            </a>
                            <a href={GITHUB_DOCS_URL} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                                <Button variant="outline" className="h-11 w-full rounded-full border-border px-5 text-sm hover:bg-accent sm:w-auto">
                                    <BrandIcon name="Github" className="mr-2 h-4 w-4" size={16} /> Docs on GitHub
                                </Button>
                            </a>
                            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                                <Button variant="ghost" className="h-11 w-full rounded-full px-5 text-sm hover:bg-accent sm:w-auto">
                                    Source Code <ExternalLink className="ml-2 h-4 w-4" />
                                </Button>
                            </a>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
                            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                <Rocket className="w-8 h-8 text-purple-500 dark:text-purple-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Onboarding-first</h3>
                                <p className="text-sm text-muted-foreground">Maps the fastest route through beta tracks, CLI install, license activation, deployment, and first useful workspace.</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                <ServerCog className="w-8 h-8 text-blue-500 dark:text-blue-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Appliance-ready</h3>
                                <p className="text-sm text-muted-foreground">Explains the Docker appliance path, preflight validation, health checks, backups, upgrades, and rollback workflows.</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                <Shield className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Security-aware</h3>
                                <p className="text-sm text-muted-foreground">Makes trust boundaries, public routes, workspace isolation, and cryptographic license verification explicit.</p>
                            </div>
                        </div>
                    </section>

                    <section id="start-here" className="scroll-mt-24 border-t border-border pt-10 md:scroll-mt-32 md:pt-16">
                        <div className="max-w-[58rem]">
                            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">New user path</h2>
                            <p className="text-muted-foreground mb-8 max-w-2xl">
                                If someone just received access, this is the shortest path from zero context to a working local Lattice OS instance.
                            </p>
                        </div>
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                            {onboardingPath.map((item) => (
                                <div key={item.step} className="rounded-2xl border border-border bg-card p-4 sm:p-6 min-w-0 overflow-hidden">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                                        <div className="w-fit rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                                            {item.step}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="mb-2 text-lg font-semibold sm:text-xl">{item.title}</h3>
                                            <p className="text-sm leading-6 text-muted-foreground sm:text-base sm:leading-relaxed">{item.description}</p>
                                            {item.command && (
                                                <pre className="mt-4 max-w-full overflow-x-auto rounded-lg border border-border bg-black/5 p-3 text-xs dark:bg-white/5 sm:p-4 sm:text-sm">
                                                    <code>{item.command}</code>
                                                </pre>
                                            )}
                                            {item.href && item.cta && (
                                                <Link href={item.href} className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
                                                    {item.cta} <ArrowRight className="ml-1 h-4 w-4" />
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section id="how-to-use" className="scroll-mt-24 border-t border-border pt-10 md:scroll-mt-32 md:pt-16">
                        <h2 className="mb-6 text-2xl font-bold tracking-tight sm:mb-8 sm:text-3xl">How to use this docs set</h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            {audiences.map((audience) => (
                                <div key={audience.title} className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                    <h3 className="text-lg font-semibold mb-3">{audience.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{audience.description}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section id="power-user-recipes" className="scroll-mt-24 border-t border-border pt-10 md:scroll-mt-32 md:pt-16">
                        <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">Power-user recipes</h2>
                        <p className="text-muted-foreground mb-8 max-w-3xl">
                            For niche questions, start from the recipe that matches the job instead of reading the docs linearly.
                        </p>
                        <div className="grid md:grid-cols-2 gap-6">
                            {powerUserRecipes.map((recipe) => {
                                const Icon = recipe.icon;
                                return (
                                    <div key={recipe.title} className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                        <Icon className="mb-4 h-7 w-7 text-primary" />
                                        <h3 className="text-lg font-semibold mb-3">{recipe.title}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{recipe.description}</p>
                                        <ul className="space-y-2">
                                            {recipe.links.map((link) => {
                                                const href = githubUrlForPath(link) ?? link;
                                                const isExternal = href.startsWith("http");
                                                return (
                                                    <li key={link}>
                                                        <a
                                                            href={href}
                                                            target={isExternal ? "_blank" : undefined}
                                                            rel={isExternal ? "noreferrer" : undefined}
                                                            className="inline-flex max-w-full items-center gap-1 rounded bg-secondary px-2 py-1 text-xs text-card-foreground transition hover:bg-accent"
                                                        >
                                                            <code className="break-all">{link}</code>
                                                            {isExternal && <ExternalLink className="h-3 w-3 flex-shrink-0" />}
                                                        </a>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {docSections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <section key={section.id} id={section.id} className="scroll-mt-24 border-t border-border pt-10 md:scroll-mt-32 md:pt-16">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="p-3 rounded-xl bg-secondary">
                                        <Icon className="w-7 h-7 text-foreground" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{section.title}</h2>
                                        <p className="text-muted-foreground mt-2">{section.description}</p>
                                    </div>
                                </div>

                                <div className="grid gap-4">
                                    {section.items.map((item) => {
                                        const sourceUrl = githubUrlForPath(item.path);
                                        return (
                                            <div key={`${section.id}-${item.title}`} className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                                <div className="flex items-start justify-between gap-3 sm:gap-4">
                                                    <div className="min-w-0">
                                                        <h3 className="mb-2 text-lg font-semibold sm:text-xl">{item.title}</h3>
                                                        <p className="mb-4 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-relaxed">{item.description}</p>
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                                            {item.href ? (
                                                                <Link href={item.href} className="inline-flex items-center text-sm font-semibold text-primary hover:underline">
                                                                    {item.path} <ArrowRight className="ml-1 h-4 w-4" />
                                                                </Link>
                                                            ) : (
                                                                <code className="rounded bg-secondary px-2 py-1 text-xs text-card-foreground break-all">
                                                                    {item.path}
                                                                </code>
                                                            )}
                                                            {sourceUrl && (
                                                                <a
                                                                    href={sourceUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                                                                >
                                                                    View source <ExternalLink className="ml-1 h-3 w-3" />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <CheckCircle2 className="mt-1 h-5 w-5 flex-shrink-0 text-emerald-500" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}

                    <section className="border-t border-border pb-10 pt-10 md:pb-16 md:pt-16">
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-600/10 p-5 text-center sm:p-8">
                            <h2 className="text-2xl font-bold mb-4">Need a path that is not documented yet?</h2>
                            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                                If you&apos;re trying to understand a route, runtime behavior, deployment issue, integration surface, or compliance requirement that isn&apos;t clear yet, use support and we can turn the answer into a reusable doc path.
                            </p>
                            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                                <Link href="/support">
                                    <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                                        Contact Support
                                    </Button>
                                </Link>
                                <Link href="/dashboard">
                                    <Button variant="outline" className="w-full border-border hover:bg-accent sm:w-auto">
                                        Open Product <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

            <footer className="py-10 border-t border-border bg-background">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="relative w-6 h-6">
                                <Image src="/lattice-logo.png" alt="Lattice OS logo" fill className="object-contain" />
                            </div>
                            <span className="text-lg font-bold text-foreground">Lattice OS</span>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-muted-foreground md:justify-end">
                            <Link href="/beta" className="hover:text-foreground transition">Beta Tracks</Link>
                            <Link href="/privacy" className="hover:text-foreground transition">Privacy Policy</Link>
                            <Link href="/support" className="hover:text-foreground transition">Support</Link>
                            <Link href="/dashboard" className="hover:text-foreground transition">Dashboard</Link>
                            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground transition">GitHub</a>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-border text-center">
                        <p className="text-muted-foreground text-sm">
                            © {new Date().getFullYear()} Lattice OS. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
