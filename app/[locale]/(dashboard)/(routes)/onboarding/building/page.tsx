'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

const STEPS = [
  '> [sys] Initializing isolated workspace container...',
  '> [net] Executing Data Refinery ingest on target URLs...',
  '> [rag] Chunking, embedding, and locking temporal graph...',
  '> [ucol] Synthesizing chameleon persona constraints...',
  '> [sys] Handoff complete. Weaver is online.',
];

export default function OnboardingBuildingPage() {
  const router = useRouter();
  const locale = useLocale();
  const [lines, setLines] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= STEPS.length) {
      const timeout = setTimeout(() => {
        router.replace(`/${locale}/workspaces/${new URLSearchParams(window.location.search).get('workspaceId') || ''}`);
      }, 600);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setLines((prev) => [...prev, STEPS[step]]);
      setStep((s) => s + 1);
    }, 420);

    return () => clearTimeout(timeout);
  }, [step, locale, router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-neutral-400 tracking-wide uppercase">Building consultant</span>
          </div>
          <div className="font-mono text-sm leading-relaxed text-neutral-300 space-y-1">
            {lines.map((line, i) => (
              <div key={i} className="animate-in fade-in duration-300">
                {line}
              </div>
            ))}
            {step < STEPS.length && (
              <div className="text-neutral-500 animate-pulse">_</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
