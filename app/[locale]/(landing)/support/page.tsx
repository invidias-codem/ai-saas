import Link from "next/link";
import Image from "next/image";
import {
  Mail,
  FileText,
  Clock,
  Bug,
  Shield,
  Boxes,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SupportForm } from "@/components/landing/support-form";

const linkCls = "inline-flex items-center min-h-[48px] transition";

const contactOptions = [
  {
    title: "Email Support",
    description: "Reach out directly for account questions, technical issues, bug reports, or product feedback.",
    icon: Mail,
    color: "text-blue-500 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    action: { label: "jjmohamme14@gmail.com", href: "mailto:jjmohamme14@gmail.com" },
  },
  {
    title: "Documentation",
    description: "Use the docs hub for architecture, runtime behavior, API references, environment variables, and operational guidance.",
    icon: FileText,
    color: "text-purple-500 dark:text-purple-400",
    bgColor: "bg-purple-500/10",
    action: { label: "View Docs", href: "/docs" },
  },
];

const resourceLinks = [
  {
    title: "Platform Documentation Hub",
    description: "Architecture, security, operations, reference docs, and ADRs in one place.",
    href: "/docs",
    icon: FileText,
    color: "text-purple-500 dark:text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    title: "Runtime & Context Architecture",
    description: "Best starting point if you're trying to understand how Lattice chooses behavior and assembles context.",
    href: "/docs#architecture",
    icon: Boxes,
    color: "text-blue-500 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Security & Route Boundaries",
    description: "Useful if your issue looks like a public/auth mismatch, route block, or permission-boundary bug.",
    href: "/docs#security",
    icon: Shield,
    color: "text-emerald-500 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    title: "Operations & Debugging",
    description: "Use when the problem looks like deployment, routing, CI/runtime mismatch, or incident diagnosis.",
    href: "/docs#operations",
    icon: Wrench,
    color: "text-amber-500 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
  },
];

const helpCategories = [
  {
    title: "Account & Access",
    description: "For sign-in, onboarding, auth gates, and user access issues.",
    icon: Shield,
    color: "text-blue-500 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    items: [
      "Sign-in and sign-up issues",
      "Unexpected auth redirects",
      "Onboarding flow problems",
      "Access to docs, support, or protected routes",
    ],
  },
  {
    title: "Product & Runtime Behavior",
    description: "For chat behavior, workspaces, operating profiles, and runtime-mode questions.",
    icon: Boxes,
    color: "text-purple-500 dark:text-purple-400",
    bgColor: "bg-purple-500/10",
    items: [
      "Conversation or workspace issues",
      "Runtime mode/routing behavior",
      "Prepared context and memory behavior",
      "Unexpected response or product-state flow",
    ],
  },
  {
    title: "Technical Issues & Bugs",
    description: "For broken pages, route regressions, deployment/runtime mismatches, and system-level problems.",
    icon: Bug,
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-500/10",
    items: [
      "Broken routes or 404s",
      "API/runtime mismatches",
      "Deploy worked but live behavior is wrong",
      "Public/authenticated boundary regressions",
    ],
  },
  {
    title: "Integrations & Operations",
    description: "For Slack, Telegram, webhooks, automation, cron, and operational troubleshooting.",
    icon: Wrench,
    color: "text-emerald-500 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
    items: [
      "Slack or Telegram integration behavior",
      "Webhook/callback issues",
      "Cron and background task failures",
      "Operational debugging questions",
    ],
  },
];

const bugReportChecklist = [
  "The route, page, or feature affected",
  "What you expected to happen",
  "What actually happened instead",
  "Whether you were logged in or logged out",
  "Screenshots or screen recordings if available",
  "Any steps that consistently reproduce the issue",
];

const technicalBugHints = [
  "Include the exact URL if the issue is route-specific",
  "Mention whether the issue is public-route, API, or workspace-related",
  "Mention whether the problem happened locally, in CI, or only in production",
  "If relevant, include any visible error message or request/response clue",
];

export default function SupportPage() {
  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative text-foreground">
      {/* Ambient background glows — preserved per spec */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 flex-grow">
        <section className="pt-16 pb-12 px-4 text-center space-y-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-700 dark:text-blue-200 backdrop-blur-xl">
            <Mail className="w-4 h-4 mr-2" />
            Support Center
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] text-foreground">
            Need help with Lattice OS?
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Whether you're troubleshooting a route, trying to understand the platform architecture, or reporting a bug, this page is the fastest way to get support or find the right docs.
          </p>
        </section>

        <section className="px-4 pb-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {contactOptions.map((option) => (
              <div
                key={option.title}
                className="p-6 rounded-2xl border border-border bg-card hover:bg-accent/50 transition"
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", option.bgColor)}>
                  <option.icon className={cn("w-6 h-6", option.color)} />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">{option.title}</h3>
                <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{option.description}</p>
                {option.action && (
                  <a
                    href={option.action.href}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium inline-flex items-center gap-1 min-h-[48px] transition"
                  >
                    {option.action.label} <ArrowRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-16 max-w-6xl mx-auto">
          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-foreground mb-3">Start with self-serve help</h2>
              <p className="text-muted-foreground max-w-3xl">
                The docs surface now covers the platform more explicitly — architecture, security, deployment reality, runtime behavior, API surfaces, and operational reference material.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resourceLinks.map((resource) => (
                <Link
                  key={resource.title}
                  href={resource.href}
                  className="rounded-xl border border-border bg-secondary p-5 hover:bg-accent/50 transition min-h-[48px]"
                >
                  <div className="flex items-start gap-4">
                    <div className={cn("p-3 rounded-lg", resource.bgColor)}>
                      <resource.icon className={cn("w-5 h-5", resource.color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">{resource.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{resource.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {helpCategories.map((category) => (
              <div key={category.title} className="rounded-2xl border border-border bg-card p-6">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4", category.bgColor)}>
                  <category.icon className={cn("w-6 h-6", category.color)} />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">{category.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{category.description}</p>
                <ul className="space-y-2 text-sm text-card-foreground">
                  {category.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-gray-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-16 max-w-5xl mx-auto">
          <div className="rounded-2xl border border-amber-300/40 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">How to report a bug well</h2>
            <p className="text-muted-foreground mb-6 max-w-3xl">
              The fastest way to get a useful response is to include the details that make the issue reproducible. If you can, include both what happened and what you expected to happen.
            </p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-foreground mb-3">Helpful details</h3>
                <ul className="space-y-2 text-sm text-card-foreground">
                  {bugReportChecklist.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-3">Especially useful for technical issues</h3>
                <ul className="space-y-2 text-sm text-card-foreground">
                  {technicalBugHints.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 border-t border-border bg-muted/50">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-foreground mb-4">Send us a message</h2>
              <p className="text-muted-foreground">
                If the docs don't answer it, reach out here and we'll get back to you as soon as possible.
              </p>
            </div>
            <SupportForm />
          </div>
        </section>

        <section className="py-16 px-4 border-t border-border">
          <div className="max-w-4xl mx-auto text-center">
            <Clock className="w-10 h-10 text-blue-500 dark:text-blue-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-4">Response expectations</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We aim to respond to support requests as quickly as possible. If the issue is urgent, make that clear in the subject line and include the route or feature affected.
            </p>
          </div>
        </section>
      </main>

      <footer className="py-10 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6">
                <Image src="/lattice-logo.png" alt="Lattice OS" fill className="object-cover" />
              </div>
              <span className="text-lg font-bold text-foreground">Lattice OS</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className={cn(linkCls, "hover:text-foreground")}>Privacy Policy</Link>
              <Link href="/docs" className={cn(linkCls, "hover:text-foreground")}>Docs</Link>
              <Link href="/blog" className={cn(linkCls, "hover:text-foreground")}>Blog</Link>
              <Link href="/" className={cn(linkCls, "hover:text-foreground")}>Home</Link>
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
