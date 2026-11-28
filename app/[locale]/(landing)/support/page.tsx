import Link from "next/link";
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
import { SupportForm } from "@/components/landing/support-form";

const contactOptions = [
  {
    title: "Email Support",
    description: "Reach out directly for account questions, technical issues, bug reports, or product feedback.",
    icon: Mail,
    action: { label: "jjmohamme14@gmail.com", href: "mailto:jjmohamme14@gmail.com" },
  },
  {
    title: "Documentation",
    description: "Use the docs hub for architecture, runtime behavior, API references, environment variables, and operational guidance.",
    icon: FileText,
    action: { label: "View Docs", href: "/docs" },
  },
];

const resourceLinks = [
  {
    title: "Platform Documentation Hub",
    description: "Architecture, security, operations, reference docs, and ADRs in one place.",
    href: "/docs",
    icon: FileText,
  },
  {
    title: "Runtime & Context Architecture",
    description: "Best starting point if you're trying to understand how Lattice chooses behavior and assembles context.",
    href: "/docs#architecture",
    icon: Boxes,
  },
  {
    title: "Security & Route Boundaries",
    description: "Useful if your issue looks like a public/auth mismatch, route block, or permission-boundary bug.",
    href: "/docs#security",
    icon: Shield,
  },
  {
    title: "Operations & Debugging",
    description: "Use when the problem looks like deployment, routing, CI/runtime mismatch, or incident diagnosis.",
    href: "/docs#operations",
    icon: Wrench,
  },
];

const helpCategories = [
  {
    title: "Account & Access",
    description: "For sign-in, onboarding, auth gates, and user access issues.",
    icon: Shield,
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
    <main className="min-w-0">
      <section className="pt-10 sm:pt-14 pb-10 px-4 text-center space-y-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center rounded-full border border-border bg-accent px-4 py-2 text-sm text-accent-foreground">
          <Mail className="w-4 h-4 mr-2" />
          Support Center
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] text-foreground">
          Need help with Lattice OS?
        </h1>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Whether you&apos;re troubleshooting a route, trying to understand the platform architecture, or reporting a bug, this page is the fastest way to get support or find the right docs.
        </p>
      </section>

      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {contactOptions.map((option) => (
            <div
              key={option.title}
              className="p-6 rounded-2xl border border-border bg-card hover:bg-accent/50 transition"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-accent">
                <option.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">{option.title}</h3>
              <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{option.description}</p>
              {option.action && (
                <a
                  href={option.action.href}
                  className="text-primary hover:underline text-sm font-medium inline-flex items-center gap-1 min-h-11 break-all transition-colors"
                >
                  {option.action.label} <ArrowRight className="h-3 w-3 shrink-0" />
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-8">
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
                  <div className="p-3 rounded-lg bg-accent">
                    <resource.icon className="w-5 h-5 text-primary" />
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
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-accent">
                <category.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">{category.title}</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{category.description}</p>
              <ul className="space-y-2 text-sm text-card-foreground">
                {category.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div className="rounded-2xl border border-border bg-chrome p-5 sm:p-8">
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
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
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
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-border bg-chrome">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-4">Send us a message</h2>
            <p className="text-muted-foreground">
              If the docs don&apos;t answer it, reach out here and we&apos;ll get back to you as soon as possible.
            </p>
          </div>
          <SupportForm />
        </div>
      </section>

      <section className="py-16 px-4 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <Clock className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-4">Response expectations</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            We aim to respond to support requests as quickly as possible. If the issue is urgent, make that clear in the subject line and include the route or feature affected.
          </p>
        </div>
      </section>
    </main>
  );
}
