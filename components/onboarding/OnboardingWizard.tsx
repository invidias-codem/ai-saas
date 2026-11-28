"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Brain, Search, Zap, FileText, Link2, StickyNote, X, Plus, Loader2 } from "lucide-react";
import { domainIntentSchema, type DomainIntent } from "@/lib/onboarding/schema";
import { StickyActionBar, FormSection } from "@/components/ui/form-mobile";

type Step = "intent" | "sources" | "building";

interface PendingSource {
  kind: "note" | "url";
  title: string;
  text?: string;
  url?: string;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const locale = useLocale();
  const [step, setStep] = useState<Step>("intent");
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Domain intent
  const [objective, setObjective] = useState("");
  const [industry, setIndustry] = useState("");
  const [role, setRole] = useState("");
  const [operatingMode, setOperatingMode] = useState<string>("agentic");

  // Step 2: Sources
  const [sources, setSources] = useState<PendingSource[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");

  const [error, setError] = useState("");

  const modes = [
    { key: "agentic", label: "Agentic Operator", blurb: "Planning, tools, workflows, review before action." },
    { key: "research", label: "Research Analyst", blurb: "Deeper context, stronger retrieval, grounded outputs." },
    { key: "drafting", label: "Drafting Partner", blurb: "Writing-heavy, artifact-friendly, medium context." },
    { key: "memory_native", label: "Memory-Native Assistant", blurb: "Continuity-focused with stronger remembered context." },
    { key: "copilot", label: "Fast Copilot", blurb: "Cheaper, faster, lighter retrieval, low tool use." },
  ] as const;

  const addNoteSource = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const title = text.split("\n")[0].slice(0, 60) || "Note";
    setSources((prev) => [...prev, { kind: "note", title, text }]);
    setNoteDraft("");
  };

  const addUrlSource = () => {
    const url = urlDraft.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL including https://");
      return;
    }
    setError("");
    setSources((prev) => [...prev, { kind: "url", title: url, url }]);
    setUrlDraft("");
  };

  const removeSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
  };

  const completeOnboarding = async () => {
    setSubmitting(true);
    setError("");

    try {
      // Validate intent
      const intentData: DomainIntent = {
        objective: objective.trim(),
        industry: industry.trim(),
        role: role.trim() || undefined,
      };
      const parsedIntent = domainIntentSchema.safeParse(intentData);
      if (!parsedIntent.success) {
        setError(parsedIntent.error.errors[0]?.message || "Please complete your domain intent.");
        setSubmitting(false);
        return;
      }

      // Derive a workspace name from intent if not provided
      const workspaceName = `${parsedIntent.data.industry} Consultant`;
      const workspaceDescription = `${parsedIntent.data.objective}${parsedIntent.data.role ? ` | Role context: ${parsedIntent.data.role}` : ""}`;

      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workIntent: "agentic",
          operatingMode,
          priorities: ["deeper_reasoning", "stronger_memory"],
          workspaceName,
          workspaceDescription,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create workspace");

      // Seed the knowledge substrate with domain intent + sources
      const payloads = [
        {
          source_type: "note",
          title: "Consultant domain intent",
          raw_text: `Objective: ${parsedIntent.data.objective}\nIndustry/Niche: ${parsedIntent.data.industry}${parsedIntent.data.role ? `\nUser Role: ${parsedIntent.data.role}` : ""}`,
          metadata: { via: "onboarding", kind: "domain_intent" },
        },
        ...sources
          .map((s) => {
            if (s.kind === "note" && s.text) {
              return {
                source_type: "note",
                title: s.title,
                raw_text: s.text,
                metadata: { via: "onboarding" },
              };
            }
            if (s.kind === "url" && s.url) {
              return {
                source_type: "url",
                title: s.title,
                origin_uri: s.url,
                raw_text: `Source URL captured during onboarding: ${s.url}`,
                metadata: { via: "onboarding", needs_scrape: true },
                cleanse: false,
              };
            }
            return null;
          })
          .filter(Boolean),
      ];

      if (payloads.length > 0 && data?.workspace?.id) {
        fetch(`/api/workspaces/${data.workspace.id}/sources/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sources: payloads }),
        }).catch((e) => console.warn("Source seeding failed (non-fatal):", e));
      }

      const urlsForWorker = sources
        .filter((s) => s.kind === "url" && s.url)
        .map((s) => s.url as string);
      const notesForWorker = sources
        .filter((s) => s.kind === "note" && s.text)
        .map((s) => s.text as string);

      fetch(`/api/onboarding/worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: data.workspace.id,
          domainIntent: intentData.objective,
          urls: urlsForWorker,
          notes: notesForWorker,
        }),
      }).catch((e) => console.warn("Background worker trigger failed (non-fatal):", e));

      router.push(`/${locale}/onboarding/building?workspaceId=${data.workspace.id}`);
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const canContinue =
    step === "intent"
      ? objective.trim().length >= 5 && industry.trim().length >= 2
      : step === "sources"
        ? true
        : false;

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-10 px-3 sm:px-4 space-y-4 sm:space-y-8 pb-24 md:pb-6">
      <div className="space-y-2 sm:space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs sm:text-sm font-medium">
          <Check className="w-3 h-3 sm:w-4 sm:h-4" />
          Onboarding wizard
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
          {step === "intent" && "Give your consultant its expertise"}
          {step === "sources" && "Feed your consultant"}
          {step === "building" && "Building your workspace"}
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
          {step === "intent" && "Tell us what this consultant should master. We'll shape its retrieval, tone, and tool use around your domain."}
          {step === "sources" && "Seed it with the source material it should already know — links first, then notes or reference text."}
          {step === "building" && "We're creating your workspace, tuning the operating profile, and seeding its knowledge substrate."}
        </p>
      </div>

      {error && (
        <Card className="p-3 sm:p-4 border-red-500/30 bg-red-500/5">
          <p className="text-xs sm:text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {step === "intent" && (
        <Card className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <FormSection title="Primary objective">
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Monitor competitor pricing for med spas and produce weekly pricing briefs..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 min-h-[100px] text-sm"
            />
          </FormSection>

          <FormSection title="Industry or niche">
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Med spa, B2B SaaS sales, headless commerce..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 text-sm h-11"
            />
          </FormSection>

          <FormSection title="Your role (optional)">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Founder, revenue ops, storefront lead..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 text-sm h-11"
            />
          </FormSection>

          <FormSection title="Operating style">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
              {modes.map((mode) => {
                const active = operatingMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    onClick={() => setOperatingMode(mode.key)}
                    className={`text-left rounded-2xl border p-3 sm:p-4 transition ${
                      active ? "border-violet-500 bg-violet-500/10" : "border-slate-200 dark:border-white/10"
                    }`}
                  >
                    <div className="font-semibold mb-1 text-sm">{mode.label}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">{mode.blurb}</div>
                  </button>
                );
              })}
            </div>
          </FormSection>
        </Card>
      )}

      {step === "sources" && (
        <Card className="p-4 sm:p-6 space-y-4 sm:space-y-6 border-neutral-800 bg-neutral-900/40">
          <FormSection title="Add a source link" description="Lead with URLs so the Data Refinery can scrape, structure, and index them automatically.">
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://... (pricing page, competitor docs, directory listings)"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none h-11"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                'https://competitor.com/pricing',
                'https://directory.com/med-spas',
                'https://docs.example.com/reference',
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setUrlDraft(example)}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[11px] font-mono text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-200"
                >
                  {example}
                </button>
              ))}
            </div>
          </FormSection>

          <FormSection title="Add a note / reference text">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Paste internal notes, pricing assumptions, or reference context..."
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none min-h-[90px]"
            />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={addNoteSource} disabled={!noteDraft.trim()} className="border-neutral-700 text-neutral-300 hover:bg-neutral-800">
                <Plus className="w-4 h-4 mr-1" /> Add note
              </Button>
            </div>
          </FormSection>

          {sources.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-neutral-300">Seeded sources ({sources.length})</div>
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.kind === "note" ? (
                        <StickyNote className="w-4 h-4 text-violet-500 shrink-0" />
                      ) : (
                        <Link2 className="w-4 h-4 text-sky-500 shrink-0" />
                      )}
                      <span className="text-sm truncate text-neutral-300">{s.title}</span>
                    </div>
                    <button onClick={() => removeSource(i)} className="text-neutral-500 hover:text-neutral-300 shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {step === "building" && (
        <Card className="p-6 sm:p-10 flex flex-col items-center text-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <h2 className="text-lg sm:text-xl font-semibold">Building your consultant</h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md">
            Creating your workspace, tuning the operating profile, and seeding the knowledge substrate.
          </p>
        </Card>
      )}

      {/* Sticky Action Bar for mobile */}
      <StickyActionBar visible={step !== "building"}>
        {step === "intent" && (
          <Button onClick={() => setStep("sources")} disabled={!canContinue} className="flex-1">
            Continue
          </Button>
        )}
        {step === "sources" && (
          <div className="flex gap-2 w-full">
            <Button variant="outline" onClick={() => setStep('intent')} className="flex-1">
              Back
            </Button>
            <Button onClick={completeOnboarding} disabled={submitting} className="flex-1">
              {submitting ? 'Creating...' : 'Create workspace'}
            </Button>
          </div>
        )}
      </StickyActionBar>

      {/* Desktop inline buttons (hidden on mobile) */}
      {step === "intent" && (
        <div className="hidden md:flex justify-end">
          <Button onClick={() => setStep("sources")} disabled={!canContinue}>
            Continue
          </Button>
        </div>
      )}
      {step === "sources" && (
        <div className="hidden md:flex justify-between">
          <Button variant="outline" onClick={() => setStep('intent')} className="border-neutral-700 text-neutral-300 hover:bg-neutral-800">
            Back
          </Button>
          <Button onClick={completeOnboarding} disabled={submitting} className="bg-white text-neutral-900 hover:bg-neutral-200">
            {submitting ? 'Creating...' : 'Create workspace'}
          </Button>
        </div>
      )}
    </div>
  );
}
