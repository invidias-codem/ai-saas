'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';

const STEPS = [
  '> [sys] Initializing isolated workspace container...',
  '> [net] Executing Data Refinery ingest on target URLs...',
  '> [rag] Chunking, embedding, and locking temporal graph...',
  '> [ucol] Synthesizing chameleon persona constraints...',
  '> [sys] Handoff complete. Weaver is online.',
];

function BuildingTerminal() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [lines, setLines] = useState<string[]>([]);
  const [step, setStep] = useState(0);

  const workspaceId = searchParams.get('workspaceId') || '';

  useEffect(() => {
    if (step >= STEPS.length) {
      const timeout = setTimeout(() => {
        // Canonical resolver route — no bare /workspaces/{id} middleman hop.
        router.replace(`/${locale}/workspaces/${workspaceId}/conversation`);
      }, 600);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setLines((prev) => [...prev, STEPS[step]]);
      setStep((s) => s + 1);
    }, 420);

    return () => clearTimeout(timeout);
  }, [step, locale, router, workspaceId]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-6 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-neutral-400 tracking-wide uppercase">Building consultant</span>
          </div>
          <div className="font-mono text-xs sm:text-sm leading-relaxed text-neutral-300 space-y-1">
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

export default function OnboardingBuildingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-200" />
      </div>
    }>
      <BuildingTerminal />
    </Suspense>
  );
}
