import Link from "next/link";
import type { Metadata } from "next";
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
import { resolveDocsLanguage, translateDocsText, type DocsLanguage } from "@/lib/docs-hub-translations";
import { LanguageSelector } from "@/components/docs/LanguageSelector";
import { resolveDocsArticlePath } from "@/lib/docs-article-localization";

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

function githubUrlForPath(path: string, language: DocsLanguage) {
    if (path.startsWith("/")) return null;
    const resolvedPath = resolveDocsArticlePath(path, language);
    const target = resolvedPath.endsWith("/") ? `tree/main/${resolvedPath.slice(0, -1)}` : `blob/main/${resolvedPath}`;
    return `${GITHUB_REPO_URL}/${target}`;
}

type DocsPageProps = { searchParams: Promise<{ lang?: string | string[] }> };

export async function generateMetadata({ searchParams }: DocsPageProps): Promise<Metadata> {
    const { lang } = await searchParams;
    const language = resolveDocsLanguage(lang);
    return {
        title: translateDocsText(language, "hero.title"),
        description: translateDocsText(language, "hero.subtitle"),
        alternates: { canonical: "/en/docs" },
        robots: { index: lang === undefined, follow: true },
    };
}

export default async function DocsPage({ searchParams }: DocsPageProps) {
    const { lang } = await searchParams;
    const language: DocsLanguage = resolveDocsLanguage(lang);
    const t = (key: string): string =>
        translateDocsText(key.endsWith(".command") ? "en" : language, key);
    const docsIndexUrl = language === "en"
        ? GITHUB_DOCS_URL
        : githubUrlForPath("docs/README.md", language) ?? GITHUB_DOCS_URL;

    const onboardingPath = [
        {
            step: t("newUser.step1.step"),
            title: t("newUser.step1.title"),
            description: t("newUser.step1.description"),
            href: "/beta",
            cta: t("newUser.step1.cta"),
        },
        {
            step: t("newUser.step2.step"),
            title: t("newUser.step2.title"),
            description: t("newUser.step2.description"),
            command: t("newUser.step2.command"),
            href: "/downloads",
            cta: t("newUser.step2.cta"),
        },
        {
            step: t("newUser.step3.step"),
            title: t("newUser.step3.title"),
            description: t("newUser.step3.description"),
            command: t("newUser.step3.command"),
        },
        {
            step: t("newUser.step4.step"),
            title: t("newUser.step4.title"),
            description: t("newUser.step4.description"),
            command: t("newUser.step4.command"),
            href: "/dashboard",
            cta: t("newUser.step4.cta"),
        },
    ];

    const powerUserRecipes = [
        {
            title: t("recipes.selfHosted.title"),
            icon: ServerCog,
            description: t("recipes.selfHosted.description"),
            links: ["scripts/lattice-cli/README.md", "docs/operations/self-hosted-topology.md", "docs/operations/self-hosted-preflight-checklist.md"],
        },
        {
            title: t("recipes.airGapped.title"),
            icon: LockKeyhole,
            description: t("recipes.airGapped.description"),
            links: ["/beta/privacy", "scripts/lattice-cli/lattice_cli/crypto_license.py", "docs/security/trust-boundaries.md"],
        },
        {
            title: t("recipes.enterprise.title"),
            icon: KeyRound,
            description: t("recipes.enterprise.description"),
            links: ["/beta/enterprise", "docs/operations/deployment-modes.md", "docs/reference/environment-variables.md"],
        },
        {
            title: t("recipes.debug.title"),
            icon: LifeBuoy,
            description: t("recipes.debug.description"),
            links: ["docs/operations/truth-surfaces.md", "docs/operations/route-verification-checklist.md", "docs/reference/request-response-examples.md"],
        },
    ];

    const docSections: DocSection[] = [
        {
            id: "overview",
            title: t("sections.overview.title"),
            icon: BookOpen,
            description: t("sections.overview.description"),
            items: [
                {
                    title: t("sections.overview.items.index.title"),
                    path: "docs/README.md",
                    description: t("sections.overview.items.index.description"),
                },
                {
                    title: t("sections.overview.items.transparency.title"),
                    path: "docs/overview/technology-transparency.md",
                    description: t("sections.overview.items.transparency.description"),
                },
                {
                    title: t("sections.overview.items.seo.title"),
                    path: "docs/overview/seo-strategy.md",
                    description: t("sections.overview.items.seo.description"),
                },
            ],
        },
        {
            id: "onboarding",
            title: t("sections.onboarding.title"),
            icon: Rocket,
            description: t("sections.onboarding.description"),
            items: [
                {
                    title: t("sections.onboarding.items.betaPicker.title"),
                    path: "/beta",
                    description: t("sections.onboarding.items.betaPicker.description"),
                    href: "/beta",
                },
                {
                    title: t("sections.onboarding.items.quickStart.title"),
                    path: "/beta/start",
                    description: t("sections.onboarding.items.quickStart.description"),
                    href: "/beta/start",
                },
                {
                    title: t("sections.onboarding.items.devTrack.title"),
                    path: "/beta/dev",
                    description: t("sections.onboarding.items.devTrack.description"),
                    href: "/beta/dev",
                },
                {
                    title: t("sections.onboarding.items.enterpriseTrack.title"),
                    path: "/beta/enterprise",
                    description: t("sections.onboarding.items.enterpriseTrack.description"),
                    href: "/beta/enterprise",
                },
                {
                    title: t("sections.onboarding.items.privacyTrack.title"),
                    path: "/beta/privacy",
                    description: t("sections.onboarding.items.privacyTrack.description"),
                    href: "/beta/privacy",
                },
            ],
        },
        {
            id: "cli-appliance",
            title: t("sections.cliAppliance.title"),
            icon: Terminal,
            description: t("sections.cliAppliance.description"),
            items: [
                {
                    title: t("sections.cliAppliance.items.cliRef.title"),
                    path: "scripts/lattice-cli/README.md",
                    description: t("sections.cliAppliance.items.cliRef.description"),
                },
                {
                    title: t("sections.cliAppliance.items.v3License.title"),
                    path: "scripts/lattice-cli/lattice_cli/crypto_license.py",
                    description: t("sections.cliAppliance.items.v3License.description"),
                },
                {
                    title: t("sections.cliAppliance.items.selfHostedTopology.title"),
                    path: "docs/operations/self-hosted-topology.md",
                    description: t("sections.cliAppliance.items.selfHostedTopology.description"),
                },
                {
                    title: t("sections.cliAppliance.items.preflightChecklist.title"),
                    path: "docs/operations/self-hosted-preflight-checklist.md",
                    description: t("sections.cliAppliance.items.preflightChecklist.description"),
                },
            ],
        },
        {
            id: "architecture",
            title: t("sections.architecture.title"),
            icon: Boxes,
            description: t("sections.architecture.description"),
            items: [
                {
                    title: t("sections.architecture.items.systemArch.title"),
                    path: "docs/architecture/system-architecture.md",
                    description: t("sections.architecture.items.systemArch.description"),
                },
                {
                    title: t("sections.architecture.items.runtimeRouting.title"),
                    path: "docs/architecture/runtime-mode-routing.md",
                    description: t("sections.architecture.items.runtimeRouting.description"),
                },
                {
                    title: t("sections.architecture.items.memoryContext.title"),
                    path: "docs/architecture/memory-and-context-architecture.md",
                    description: t("sections.architecture.items.memoryContext.description"),
                },
                {
                    title: t("sections.architecture.items.workspaceModel.title"),
                    path: "docs/architecture/workspace-operating-profile-model.md",
                    description: t("sections.architecture.items.workspaceModel.description"),
                },
                {
                    title: t("sections.architecture.items.retrievalGraph.title"),
                    path: "docs/architecture/retrieval-and-graph-strategy.md",
                    description: t("sections.architecture.items.retrievalGraph.description"),
                },
            ],
        },
        {
            id: "security",
            title: t("sections.security.title"),
            icon: Shield,
            description: t("sections.security.description"),
            items: [
                {
                    title: t("sections.security.items.publicRoutes.title"),
                    path: "docs/security/public-routes.md",
                    description: t("sections.security.items.publicRoutes.description"),
                },
                {
                    title: t("sections.security.items.trustBoundaries.title"),
                    path: "docs/security/trust-boundaries.md",
                    description: t("sections.security.items.trustBoundaries.description"),
                },
                {
                    title: t("sections.security.items.licenseVerification.title"),
                    path: "scripts/lattice-cli/lattice_cli/crypto_license.py",
                    description: t("sections.security.items.licenseVerification.description"),
                },
            ],
        },
        {
            id: "operations",
            title: t("sections.operations.title"),
            icon: Wrench,
            description: t("sections.operations.description"),
            items: [
                {
                    title: t("sections.operations.items.truthSurfaces.title"),
                    path: "docs/operations/truth-surfaces.md",
                    description: t("sections.operations.items.truthSurfaces.description"),
                },
                {
                    title: t("sections.operations.items.deployment.title"),
                    path: "docs/operations/deployment.md",
                    description: t("sections.operations.items.deployment.description"),
                },
                {
                    title: t("sections.operations.items.deploymentModes.title"),
                    path: "docs/operations/deployment-modes.md",
                    description: t("sections.operations.items.deploymentModes.description"),
                },
                {
                    title: t("sections.operations.items.routeVerification.title"),
                    path: "docs/operations/route-verification-checklist.md",
                    description: t("sections.operations.items.routeVerification.description"),
                },
                {
                    title: t("sections.operations.items.incidentDebugging.title"),
                    path: "docs/operations/incident-debugging.md",
                    description: t("sections.operations.items.incidentDebugging.description"),
                },
            ],
        },
        {
            id: "reference",
            title: t("sections.reference.title"),
            icon: FileCode2,
            description: t("sections.reference.description"),
            items: [
                {
                    title: t("sections.reference.items.apiRef.title"),
                    path: "docs/reference/api-reference.md",
                    description: t("sections.reference.items.apiRef.description"),
                },
                {
                    title: t("sections.reference.items.envVars.title"),
                    path: "docs/reference/environment-variables.md",
                    description: t("sections.reference.items.envVars.description"),
                },
                {
                    title: t("sections.reference.items.requestResponse.title"),
                    path: "docs/reference/request-response-examples.md",
                    description: t("sections.reference.items.requestResponse.description"),
                },
                {
                    title: t("sections.reference.items.sourceFileMap.title"),
                    path: "docs/reference/source-file-map.md",
                    description: t("sections.reference.items.sourceFileMap.description"),
                },
            ],
        },
        {
            id: "decisions",
            title: t("sections.decisions.title"),
            icon: GitBranch,
            description: t("sections.decisions.description"),
            items: [
                {
                    title: t("sections.decisions.items.adrIndex.title"),
                    path: "docs/decisions/README.md",
                    description: t("sections.decisions.items.adrIndex.description"),
                },
                {
                    title: t("sections.decisions.items.adrSet.title"),
                    path: "docs/decisions/",
                    description: t("sections.decisions.items.adrSet.description"),
                },
            ],
        },
    ];

    const audiences = [
        {
            title: t("howToUse.audiences.newUsers.title"),
            description: t("howToUse.audiences.newUsers.description"),
        },
        {
            title: t("howToUse.audiences.developers.title"),
            description: t("howToUse.audiences.developers.description"),
        },
        {
            title: t("howToUse.audiences.operators.title"),
            description: t("howToUse.audiences.operators.description"),
        },
        {
            title: t("howToUse.audiences.powerUsers.title"),
            description: t("howToUse.audiences.powerUsers.description"),
        },
    ];

    return (
        <div lang={language} className="bg-background min-h-screen flex flex-col overflow-x-hidden relative text-foreground">
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
            </div>

            <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-10 pt-24 sm:px-6 sm:pt-28 md:flex-row md:gap-12 md:px-10 md:py-12">
                <aside className="w-full md:w-72 flex-shrink-0 hidden md:block">
                    <div className="sticky top-32 space-y-8">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                {t("sidebar.label")}
                            </h3>
                            <LanguageSelector language={language} selectId="docs-language-desktop" />
                        </div>
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
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                            {t("usefulFor.label")}
                        </h3>
                        <ul className="space-y-3 border-l border-border">
                            {['item1', 'item2', 'item3', 'item4', 'item5'].map((key, index) => (
                                <li key={key} className="block pl-4 text-muted-foreground">
                                    {t(`usefulFor.${key}`)}
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>

                <div className="w-full flex-grow space-y-10 md:max-w-4xl md:space-y-16">
                    <section id="hero" className="scroll-mt-32">
                        <div className="mb-5 md:hidden">
                            <LanguageSelector language={language} selectId="docs-language-mobile" />
                        </div>
                        <div className="mb-5 inline-flex max-w-full items-start gap-2 rounded-2xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[11px] font-medium leading-snug text-purple-700 dark:text-purple-200 sm:items-center sm:rounded-full sm:text-xs">
                            <BookOpen className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 sm:mt-0" />
                            <span>{t("hero.badge")}</span>
                        </div>
                        <h1 className="mb-5 max-w-3xl bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 bg-clip-text text-[2.35rem] font-bold leading-[1.04] tracking-tight text-transparent dark:from-white dark:via-slate-300 dark:to-slate-500 min-[390px]:text-[2.75rem] sm:text-5xl md:text-6xl">
                            {t("hero.title")}
                        </h1>
                        <p className="mb-6 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg md:text-xl md:leading-relaxed">
                            {t("hero.subtitle")}
                        </p>

                        <div className="mb-6 grid gap-3 sm:mb-8 sm:flex sm:flex-wrap">
                            <Link href="/beta/start" className="w-full sm:w-auto">
                                <Button className="h-11 w-full rounded-full px-5 text-sm font-semibold sm:w-auto">
                                    {t("hero.ctaPrimary")} <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                            <a href="#power-user-recipes" className="w-full sm:w-auto">
                                <Button variant="outline" className="h-11 w-full rounded-full border-border px-5 text-sm hover:bg-accent sm:w-auto">
                                    {t("hero.ctaSecondary")}
                                </Button>
                            </a>
                            <a href={docsIndexUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                                <Button variant="outline" className="h-11 w-full rounded-full border-border px-5 text-sm hover:bg-accent sm:w-auto">
                                    <BrandIcon name="Github" className="mr-2 h-4 w-4" size={16} /> {t("hero.ctaGithub")}
                                </Button>
                            </a>
                            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                                <Button variant="ghost" className="h-11 w-full rounded-full px-5 text-sm hover:bg-accent sm:w-auto">
                                    {t("hero.ctaSource")} <ExternalLink className="ml-2 h-4 w-4" />
                                </Button>
                            </a>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
                            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                <Rocket className="w-8 h-8 text-purple-500 dark:text-purple-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">{t("features.onboardingTitle")}</h3>
                                <p className="text-sm text-muted-foreground">{t("features.onboardingDesc")}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                <ServerCog className="w-8 h-8 text-blue-500 dark:text-blue-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">{t("features.applianceTitle")}</h3>
                                <p className="text-sm text-muted-foreground">{t("features.applianceDesc")}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                                <Shield className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">{t("features.securityTitle")}</h3>
                                <p className="text-sm text-muted-foreground">{t("features.securityDesc")}</p>
                            </div>
                        </div>
                    </section>

                    <section id="start-here" className="scroll-mt-24 border-t border-border pt-10 md:scroll-mt-32 md:pt-16">
                        <div className="max-w-[58rem]">
                            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
                                {t("newUser.title")}
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-2xl">
                                {t("newUser.subtitle")}
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
                                                    <code lang="en">{item.command}</code>
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
                        <h2 className="mb-6 text-2xl font-bold tracking-tight sm:mb-8 sm:text-3xl">
                            {t("howToUse.title")}
                        </h2>
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
                        <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
                            {t("recipes.title")}
                        </h2>
                        <p className="text-muted-foreground mb-8 max-w-3xl">
                            {t("recipes.subtitle")}
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
                                                const href = githubUrlForPath(link, language) ?? link;
                                                const isExternal = href.startsWith("http");
                                                return (
                                                    <li key={link}>
                                                        <a
                                                            href={href}
                                                            target={isExternal ? "_blank" : undefined}
                                                            rel={isExternal ? "noreferrer" : undefined}
                                                            className="inline-flex max-w-full items-center gap-1 rounded bg-secondary px-2 py-1 text-xs text-card-foreground transition hover:bg-accent"
                                                        >
                                                            <code lang="en" className="break-all">{link}</code>
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
                                        const sourceUrl = githubUrlForPath(item.path, language);
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
                                                                <code lang="en" className="rounded bg-secondary px-2 py-1 text-xs text-card-foreground break-all">
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
                                                                    {t("nav.viewSource")} <ExternalLink className="ml-1 h-3 w-3" />
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
                            <h2 className="text-2xl font-bold mb-4">
                                {t("cta.needPath")}
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                                {t("cta.needPathDesc")}
                            </p>
                            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                                <Link href="/support">
                                    <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                                        {t("cta.support")}
                                    </Button>
                                </Link>
                                <Link href="/dashboard">
                                    <Button variant="outline" className="w-full border-border hover:bg-accent sm:w-auto">
                                        {t("cta.dashboard")} <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}