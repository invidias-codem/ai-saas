"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Braces, Check, CheckCircle2, ChevronRight,
  Circle, Code2, Layers3, LockKeyhole, MonitorSmartphone, MousePointer2,
  Sparkles, WandSparkles, Workflow,
} from "lucide-react";

type DemoStage = "plan" | "code" | "preview";
const demoStages: { id: DemoStage; label: string; detail: string }[] = [
  { id: "plan", label: "Plan", detail: "Translate intent into a build plan" },
  { id: "code", label: "Code", detail: "Review source and iterations" },
  { id: "preview", label: "Preview", detail: "Test an isolated application" },
];

function DemoSurface() {
  const [stage, setStage] = useState<DemoStage>("preview");
  const [checkedIn, setCheckedIn] = useState(false);
  return (
    <div
      className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/15 bg-[#101218] text-white shadow-[0_36px_100px_-38px_rgba(16,13,47,0.55)] sm:rounded-[2rem]"
      aria-label="Illustrative Code Builder walkthrough"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff7b7b]/70" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f4be69]/70" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#7fd5a9]/70" aria-hidden="true" />
          <span className="ml-3 text-[11px] font-semibold tracking-wide text-white/80">Lattice / Code Builder</span>
        </div>
        <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] tracking-wide text-white/65">
          Illustrative walkthrough
        </span>
      </div>
      <div className="grid min-w-0 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="hidden border-r border-white/10 bg-[#14151c] p-4 lg:flex lg:flex-col">
          <p className="mb-4 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">Workspace</p>
          <div className="flex items-center gap-2 rounded-lg bg-violet-400/10 px-3 py-2.5 text-xs font-medium text-violet-200">
            <Layers3 className="h-4 w-4" aria-hidden="true" /> Event check-in
          </div>
          <div className="mt-3 space-y-1 px-2 text-xs text-white/50">
            <div className="flex items-center gap-2 py-2"><Workflow className="h-3.5 w-3.5" /> Build plan</div>
            <div className="flex items-center gap-2 py-2"><Braces className="h-3.5 w-3.5" /> Source files</div>
            <div className="flex items-center gap-2 py-2"><MonitorSmartphone className="h-3.5 w-3.5" /> App preview</div>
          </div>
          <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-white/45">
            A single place to build, inspect, and test.
          </div>
        </div>
        <div className="min-w-0">
          <div className="border-b border-white/10 px-3 py-3 sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Event check-in app</p>
                <p className="mt-0.5 text-[11px] text-white/45">A small application, from a natural-language request</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Example complete
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-white/[0.05] p-1" role="group" aria-label="Choose demo step">
              {demoStages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={stage === item.id}
                  onClick={() => setStage(item.id)}
                  className={`min-h-11 rounded-lg px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${
                    stage === item.id ? "bg-white text-[#14151b]" : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-[315px] p-4 sm:min-h-[380px] sm:p-6" aria-live="polite">
            {stage === "plan" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-violet-300/15 bg-violet-300/[0.06] p-4">
                  <p className="text-[11px] font-medium text-violet-300">Your idea</p>
                  <p className="mt-2 text-sm leading-6 text-white/85">“Build a simple RSVP and guest check-in app for my next event.”</p>
                </div>
                <p className="text-sm font-semibold">Proposed build plan</p>
                {[
                  ["Design the guest list", "Guest name, RSVP status, check-in state"],
                  ["Generate the application", "Responsive interface and interaction logic"],
                  ["Review and test", "Inspect the code, then open an isolated preview"],
                ].map(([name, note], index) => (
                  <div key={name} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-400/15 text-xs font-semibold text-violet-200">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      <p className="mt-1 text-xs leading-5 text-white/45">{note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {stage === "code" && (
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-xs text-white/55">
                  <Code2 className="h-4 w-4" /> <span>components/GuestCheckIn.tsx</span>
                </div>
                <pre className="max-w-full overflow-x-auto rounded-xl border border-white/10 bg-[#0b0d13] p-4 text-[11px] leading-[1.9] text-[#d3d5eb] sm:text-xs"><code>{`type Guest = {
  name: string;
  checkedIn: boolean;
};

export function checkIn(guest: Guest) {
  return {
    ...guest,
    checkedIn: true,
  };
}

// Reviewable source.
// An example of generated app logic.`}</code></pre>
                <p className="mt-4 text-xs leading-5 text-white/45">Review the generated source before deciding what to keep or change.</p>
              </div>
            )}
            {stage === "preview" && (
              <div className="rounded-[1.2rem] bg-[#f7f6f3] p-4 text-[#202025] shadow-inner sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e9e5df] pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">Example application</p>
                    <p className="mt-1 text-lg font-bold tracking-tight">Studio Open House</p>
                  </div>
                  <span className="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-medium text-violet-800">Guest check-in</span>
                </div>
                <div className="mt-5 rounded-xl border border-[#e8e3dc] bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#837e79]">Guest</p>
                      <p className="mt-1 text-sm font-semibold">Jordan Ellis</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${checkedIn ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {checkedIn ? "Checked in" : "Awaiting arrival"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckedIn((current) => !current)}
                    className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#25232d] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#403a57] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                  >
                    {checkedIn ? <Check className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
                    {checkedIn ? "Undo check-in" : "Check in guest"}
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-[#827b76]">Try the button. This interactive sample is local to this page, not a live published app.</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-4 py-3 sm:px-6">
            <p className="max-w-sm text-xs leading-5 text-white/45">{demoStages.find((item) => item.id === stage)?.detail}</p>
            <Link href="/code/builder" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-violet-200 underline-offset-4 hover:underline">
              Open real Code Builder <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const steps = [
  {
    icon: WandSparkles,
    number: "01",
    title: "Start with a problem",
    description: "Tell Lattice what you&apos;d like to build. Turn your goal into a plan you can inspect.",
  },
  {
    icon: Braces,
    number: "02",
    title: "Build with AI",
    description: "Generate an application in Code Builder. Review the source and refine the result.",
  },
  {
    icon: MonitorSmartphone,
    number: "03",
    title: "Test the experience",
    description: "Use isolated preview where enabled, with code and logs nearby. Private sharing is still in development.",
  },
];

export function ProductHuntLaunch() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#f7f5f0] text-[#23212d]">
      <section className="relative isolate overflow-hidden px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36 lg:pt-40">
        <div className="pointer-events-none absolute -right-40 -top-44 -z-10 h-[480px] w-[480px] rounded-full bg-violet-200/60 blur-[110px] sm:h-[680px] sm:w-[680px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-72 -left-44 -z-10 h-[500px] w-[500px] rounded-full bg-amber-100/70 blur-[105px]" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-10">
          <div className="min-w-0">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-300/70 bg-white/80 px-3 py-1.5 text-xs font-semibold tracking-wide text-violet-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI-powered software workspace
            </p>
            <h1 className="max-w-xl text-balance text-[clamp(2.85rem,6.3vw,5.4rem)] font-semibold leading-[1.02] tracking-[-0.07em]">
              Build software with AI. <span className="text-violet-700">Keep it yours.</span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-[#605d69] sm:text-lg">
              From an idea to reviewable code and an app you can test.
              Lattice brings Code Builder and conversational workspaces together,
              so you can keep creating instead of starting over.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/code/builder"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#262236] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#40385b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 sm:w-auto"
              >
                Try Code Builder <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#demo"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#c8c1cb] bg-white/65 px-6 text-sm font-semibold transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 sm:w-auto"
              >
                Explore the product <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-4 text-xs leading-5 text-[#777380]">Code Builder requires sign-in. Preview availability depends on your deployment.</p>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-[#625e6d]">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-violet-700" /> Reviewable source</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-violet-700" /> Multi-model workflows</span>
              <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-violet-700" /> Controlled workspace access</span>
            </div>
          </div>
          <div id="demo" className="min-w-0 scroll-mt-28">
            <DemoSurface />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-28 border-t border-[#e3ded9] bg-white/70 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">From idea to app</p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">Less tool switching. More building.</h2>
            <p className="mt-5 text-base leading-7 text-[#64616b]">The workflow stays focused on what you&apos;re making, with the AI helping across the planning, implementation, and review steps.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <article key={number} className="flex min-w-0 flex-col rounded-[1.4rem] border border-[#e5e0da] bg-[#faf9f6] p-6 shadow-[0_14px_48px_-34px_rgba(32,22,44,0.3)]">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-800"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="font-mono text-xs text-[#948b9d]">{number}</span>
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#65616a]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="ownership-heading">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-[1.8rem] bg-[#201d2c] p-6 text-white sm:p-10 lg:grid-cols-[1fr_0.9fr] lg:gap-16 lg:p-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Built for makers</p>
            <h2 id="ownership-heading" className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-5xl">
              Your idea deserves more than a disposable demo.
            </h2>
            <p className="mt-6 max-w-lg text-sm leading-7 text-white/65 sm:text-base">Inspect the generated source, keep the conversation in your workspace, and decide how the software evolves. Lattice is building toward a workflow where creators remain in control from prototype to publication.</p>
            <Link href="/code/builder" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#242034] transition-colors hover:bg-violet-100">
              Start building <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid content-center gap-3">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
              <div><p className="font-semibold">Code Builder</p><p className="mt-1 text-sm leading-6 text-white/55">Generate and inspect code in a persistent build workflow.</p></div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div><p className="font-semibold">Isolated preview — limited beta</p><p className="mt-1 text-sm leading-6 text-white/55">Preview environments are being qualified; availability isn&apos;t universal.</p></div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-4">
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
              <div><p className="font-semibold">Private publication — in development</p><p className="mt-1 text-sm leading-6 text-white/55">Permanent, shareable app links remain behind security and release gates.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e6e0dc] px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="get-started-heading">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">Build something real</p>
            <h2 id="get-started-heading" className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Start with the idea you can&apos;t stop thinking about.</h2>
            <p className="mt-3 text-sm leading-6 text-[#655f69]">Tell us what works, what breaks, and what you&apos;d like to build next.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto">
            <Link href="/code/builder" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-violet-800 sm:w-auto">
              Open Code Builder <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/support" className="inline-flex min-h-10 items-center justify-center gap-2 text-sm font-medium text-[#5a4f69] underline-offset-4 hover:underline">Share feedback <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </main>
  );
}
