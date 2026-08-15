"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Brain, Search, Zap, FileText, Link2, StickyNote, X, Plus, Loader2 } from "lucide-react";
import { domainIntentSchema, type DomainIntent } from "@/lib/onboarding/schema";

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

      router.push(`/${locale}/workspaces/${data.workspace.id}`);
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
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-sm font-medium">
          <Check className="w-4 h-4" />
          Onboarding wizard
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          {step === "intent" && "Give your consultant its expertise"}
          {step === "sources" && "Feed your consultant"}
          {step === "building" && "Building your workspace"}
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {step === "intent" && "Tell us what this consultant should master. We’ll shape its retrieval, tone, and tool use around your domain."}
          {step === "sources" && "Seed it with the source material it should already know — links first, then notes or reference text."}
          {step === "building" && "We’re creating your workspace, tuning the operating profile, and seeding its knowledge substrate."}
        </p>
      </div>

      {error && (
        <Card className="p-4 border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {step === "intent" && (
        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Primary objective</label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Monitor competitor pricing for med spas and produce weekly pricing briefs..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Industry or niche</label>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Med spa, B2B SaaS sales, headless commerce..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Your role <span className="text-muted-foreground">(optional)</span></label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Founder, revenue ops, storefront lead..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Operating style</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modes.map((mode) => {
                const active = operatingMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    onClick={() => setOperatingMode(mode.key)}
                    className={`text-left rounded-2xl border p-4 transition ${
                      active ? "border-violet-500 bg-violet-500/10" : "border-slate-200 dark:border-white/10"
                    }`}
                  >
                    <div className="font-semibold mb-1">{mode.label}</div>
                    <div className="text-sm text-muted-foreground">{mode.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep("sources")} disabled={!canContinue}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === "sources" && (
        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-500" /> Add a source link
            </label>
            <div className="flex gap-2">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://... (pricing page, competitor docs, directory listings)"
                className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3"
              />
              <Button variant="outline" size="sm" onClick={addUrlSource} disabled={!urlDraft.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Add link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Lead with URLs so the Data Refinery can scrape, structure, and index them automatically.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-violet-500" /> Add a note / reference text
            </label>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Paste internal notes, pricing assumptions, or reference context..."
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 min-h-[90px]"
            />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={addNoteSource} disabled={!noteDraft.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Add note
              </Button>
            </div>
          </div>

          {sources.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Seeded sources ({sources.length})</div>
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.kind === "note" ? (
                        <StickyNote className="w-4 h-4 text-violet-500 shrink-0" />
                      ) : (
                        <Link2 className="w-4 h-4 text-sky-500 shrink-0" />
                      )}
                      <span className="text-sm truncate">{s.title}</span>
                    </div>
                    <button onClick={() => removeSource(i)} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("intent")}>
              Back
            </Button>
            <Button onClick={() => setStep("building")}>Create workspace</Button>
          </div>
        </Card>
      )}

      {step === "building" && (
        <Card className="p-10 flex flex-col items-center text-center space-y-4">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <h2 className="text-xl font-semibold">Building your consultant</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Creating your workspace, tuning the operating profile, and seeding the knowledge substrate.
          </p>
        </Card>
      )}
    </div>
  );
}
