'use client';

import { useState } from 'react';

export function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try { await navigator.clipboard.writeText(command); setStatus('copied'); }
    catch { setStatus('failed'); }
  }
  return <div className="mt-3 min-w-0 rounded-xl border border-border bg-chrome p-4">
    <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-accent-foreground"><code>{command}</code></pre>
    <button type="button" onClick={copy} className="mt-2 min-h-11 text-xs font-medium text-primary underline underline-offset-4">Copy commands</button>
    <span role="status" className="ml-3 text-xs text-muted-foreground">{status === 'copied' ? 'Copied.' : status === 'failed' ? 'Select and copy the text above.' : ''}</span>
  </div>;
}
