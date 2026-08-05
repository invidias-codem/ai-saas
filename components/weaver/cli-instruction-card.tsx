'use client';

import { useState } from 'react';

export function CLIInstructionCard() {
  const [copied, setCopied] = useState(false);

  const snippet = `npm install -g lattice-cli && lattice-cli auth --token <uuid>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-200">Terminal setup</p>
        <button
          onClick={handleCopy}
          className="text-xs text-neutral-400 underline"
          type="button"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="mt-3 overflow-x-auto text-xs text-neutral-300">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
