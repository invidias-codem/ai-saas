"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check, Brain, Zap, Search, FileText, FolderKanban } from 'lucide-react';

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

  const togglePriority = (key: string) => {
    setSelectedPriorities((prev) => {
      if (prev.includes(key)) return prev.filter((item) => item !== key);
      if (prev.length >= 2) return [...prev.slice(1), key];
      return [...prev, key];
    });
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
          <h2 className="text-xl font-semibold">5. Confirm your setup</h2>
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
            <div><span className="font-medium">Workspace:</span> {workspaceName}</div>
            <div><span className="font-medium">Mode:</span> {operatingMode}</div>
            <div><span className="font-medium">Priorities:</span> {selectedPriorities.length ? selectedPriorities.join(', ') : 'None selected'}</div>
            <p className="text-sm text-muted-foreground">
              Tech Genie will create a workspace and tune its operating profile around this setup.
            </p>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
            <Button onClick={completeOnboarding} disabled={submitting}>
              {submitting ? 'Creating workspace...' : 'Enter workspace'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
