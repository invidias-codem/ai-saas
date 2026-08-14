"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Brain, Zap, Search, FileText, FolderKanban, Link2, StickyNote, X, Plus } from 'lucide-react';

const intents = [
  { key: 'copilot', label: 'Think and chat with AI', icon: Brain },
  { key: 'research', label: 'Research topics deeply', icon: Search },
  { key: 'agentic', label: 'Run agentic tasks and workflows', icon: Zap },
  { key: 'drafting', label: 'Draft docs, plans, or posts', icon: FileText },
  { key: 'coding', label: 'Build software / technical work', icon: FolderKanban },
  { key: 'memory_native', label: 'Organize long-term memory', icon: Brain },
] as const;

const modes = [
  { key: 'copilot', label: 'Fast Copilot', blurb: 'Cheaper, faster, lighter retrieval, low tool use.' },
  { key: 'research', label: 'Research Analyst', blurb: 'Deeper context, stronger retrieval, grounded outputs.' },
  { key: 'agentic', label: 'Agentic Operator', blurb: 'Planning, tools, workflows, more review before action.' },
  { key: 'drafting', label: 'Drafting Partner', blurb: 'Writing-heavy, artifact-friendly, medium context.' },
  { key: 'memory_native', label: 'Memory-Native Assistant', blurb: 'Continuity-focused with stronger remembered context.' },
] as const;

const priorities = [
  { key: 'lower_cost', label: 'Lower cost' },
  { key: 'faster_responses', label: 'Faster responses' },
  { key: 'deeper_reasoning', label: 'Deeper reasoning' },
  { key: 'stronger_memory', label: 'Stronger memory' },
  { key: 'more_automation', label: 'More automation' },
  { key: 'more_control_review', label: 'More control/review' },
] as const;

interface PendingSource {
  kind: 'note' | 'url';
  title: string;
  text?: string;
  url?: string;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const locale = useLocale();
  const [step, setStep] = useState(1);
  const [workIntent, setWorkIntent] = useState<string>('copilot');
  const [operatingMode, setOperatingMode] = useState<string>('copilot');
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Chameleon: domain intent + seed knowledge sources
  const [domainIntent, setDomainIntent] = useState('');
  const [sources, setSources] = useState<PendingSource[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');

  const togglePriority = (key: string) => {
    setSelectedPriorities((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      if (prev.length >= 2) return [...prev.slice(1), key];
      return [...prev, key];
    });
  };

  const addNoteSource = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const title = text.split('\n')[0].slice(0, 60) || 'Note';
    setSources((prev) => [...prev, { kind: 'note', title, text }]);
    setNoteDraft('');
  };

  const addUrlSource = () => {
    const url = urlDraft.trim();
    if (!url) return;
    setSources((prev) => [...prev, { kind: 'url', title: url, url }]);
    setUrlDraft('');
  };

  const removeSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
  };

  // After the workspace exists, seed its knowledge substrate with the
  // captured sources so the consultant is born with context. Best-effort:
  // failures here must not block entering the workspace.
  const seedSources = async (workspaceId: string) => {
    const payloads = sources
      .map((s) => {
        if (s.kind === 'note' && s.text) {
          return {
            source_type: 'note',
            title: s.title,
            raw_text: s.text,
            metadata: { via: 'onboarding' },
          };
        }
        if (s.kind === 'url' && s.url) {
          return {
            source_type: 'url',
            title: s.title,
            origin_uri: s.url,
            raw_text: `Source URL captured during onboarding: ${s.url}`,
            metadata: { via: 'onboarding', needs_scrape: true },
            cleanse: false,
          };
        }
        return null;
      })
      .filter(Boolean);

    // Domain intent itself becomes the first high-signal knowledge chunk so
    // the persona + retrieval layer immediately know what this consultant is.
    if (domainIntent.trim()) {
      payloads.unshift({
        source_type: 'note',
        title: 'Consultant domain intent',
        raw_text: `This consultant's domain and purpose: ${domainIntent.trim()}`,
        metadata: { via: 'onboarding', kind: 'domain_intent' },
      } as any);
    }

    if (payloads.length === 0) return;

    try {
      await fetch(`/api/workspaces/${workspaceId}/sources/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: payloads }),
      });
    } catch (e) {
      console.warn('Source seeding failed (non-fatal):', e);
    }
  };

  const completeOnboarding = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workIntent,
          operatingMode,
          priorities: selectedPriorities,
          workspaceName,
          workspaceDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete onboarding');

      // Seed the knowledge substrate before entering, so Weaver opens with
      // the consultant's domain + sources already in place.
      // Fire-and-forget: the workspace enters immediately; ingestion runs
      // in the background so the final onboarding step never blocks on it.
      if (data?.workspace?.id) {
        seedSources(data.workspace.id).catch((e) => console.warn('Source seeding failed (non-fatal):', e));
      }

      router.push(`/${locale}${data.redirectTo}`);
    } catch (error) {
      console.error('Onboarding failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-sm font-medium">
          <Check className="w-4 h-4" />
          Onboarding wizard
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Let’s set up how Tech Genie should work for you</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          We’ll create your first workspace and configure how the system thinks, remembers, and uses tools.
        </p>
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-xl font-semibold">1. What are you here to do?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {intents.map((intent) => {
              const Icon = intent.icon;
              const active = workIntent === intent.key;
              return (
                <button
                  key={intent.key}
                  onClick={() => setWorkIntent(intent.key)}
                  className={`text-left rounded-2xl border p-4 transition ${active ? 'border-violet-500 bg-violet-500/10' : 'border-slate-200 dark:border-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-violet-500" />
                    <span className="font-medium">{intent.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-xl font-semibold">2. Choose your working style</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modes.map((mode) => {
              const active = operatingMode === mode.key;
              return (
                <button
                  key={mode.key}
                  onClick={() => setOperatingMode(mode.key)}
                  className={`text-left rounded-2xl border p-4 transition ${active ? 'border-sky-500 bg-sky-500/10' : 'border-slate-200 dark:border-white/10'}`}
                >
                  <div className="font-semibold mb-1">{mode.label}</div>
                  <div className="text-sm text-muted-foreground">{mode.blurb}</div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-xl font-semibold">3. What matters most?</h2>
          <p className="text-sm text-muted-foreground">Choose up to two priorities.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {priorities.map((priority) => {
              const active = selectedPriorities.includes(priority.key);
              return (
                <button
                  key={priority.key}
                  onClick={() => togglePriority(priority.key)}
                  className={`text-left rounded-2xl border p-4 transition ${active ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-200 dark:border-white/10'}`}
                >
                  <div className="font-medium">{priority.label}</div>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => setStep(4)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-xl font-semibold">4. Create your first workspace</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Workspace name</label>
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <textarea
                value={workspaceDescription}
                onChange={(e) => setWorkspaceDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 min-h-[100px]"
              />
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={() => setStep(5)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-xl font-semibold">5. Give your consultant its expertise</h2>
          <p className="text-sm text-muted-foreground">
            This is what makes it a chameleon. Tell it what domain to master and seed it with
            your own sources — notes, reference text, or links — so it opens already knowing your world.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">What should this consultant be an expert in?</label>
            <textarea
              value={domainIntent}
              onChange={(e) => setDomainIntent(e.target.value)}
              placeholder="e.g. Reef aquarium husbandry and local fish store pricing, or B2B SaaS sales strategy for early-stage founders…"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 min-h-[80px]"
            />
          </div>

          {/* Note source */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-violet-500" /> Add a note / reference text
            </label>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Paste notes, a NotebookLM export, key facts, pricing you already know…"
              className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3 min-h-[90px]"
            />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={addNoteSource} disabled={!noteDraft.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Add note
              </Button>
            </div>
          </div>

          {/* URL source */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-500" /> Add a source link
            </label>
            <div className="flex gap-2">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://… (pricing page, docs, directory — we'll refine it)"
                className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 bg-transparent px-4 py-3"
              />
              <Button variant="outline" size="sm" onClick={addUrlSource} disabled={!urlDraft.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Add link
              </Button>
            </div>
          </div>

          {/* Pending sources */}
          {sources.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Seeded sources ({sources.length})</div>
              <div className="space-y-2">
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.kind === 'note' ? <StickyNote className="w-4 h-4 text-violet-500 shrink-0" /> : <Link2 className="w-4 h-4 text-sky-500 shrink-0" />}
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
            <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
            <Button onClick={() => setStep(6)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 6 && (
        <Card className="p-6 space-y-5">
          <h2 className="text-xl font-semibold">6. Confirm your setup</h2>
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
            <div><span className="font-medium">Workspace:</span> {workspaceName}</div>
            <div><span className="font-medium">Mode:</span> {operatingMode}</div>
            <div><span className="font-medium">Priorities:</span> {selectedPriorities.length ? selectedPriorities.join(', ') : 'None selected'}</div>
            {domainIntent.trim() && (
              <div><span className="font-medium">Expertise:</span> {domainIntent.trim()}</div>
            )}
            {sources.length > 0 && (
              <div><span className="font-medium">Knowledge sources:</span> {sources.length} seeded</div>
            )}
            <p className="text-sm text-muted-foreground">
              Tech Genie will create a workspace, seed its knowledge, and tune its operating profile around this setup.
            </p>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(5)}>Back</Button>
            <Button onClick={completeOnboarding} disabled={submitting}>
              {submitting ? 'Creating workspace...' : 'Enter workspace'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
