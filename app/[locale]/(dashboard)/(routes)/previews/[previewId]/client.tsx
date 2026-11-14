// app/[locale]/(dashboard)/(routes)/previews/[previewId]/client.tsx
// Phase 8D: Owner-only preview client component.
// Preview / Code / Logs tabs with responsive desktop/mobile layout.
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Code2,
  Layout,
  List,
  Play,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Smartphone,
  Monitor,
} from 'lucide-react';

interface PreviewOwnerClientProps {
  previewId: string;
  buildId: string;
  previewStatus: string;
  sandboxUrl?: string;
  expiresAt?: string | null;
  build: {
    build_id: string;
    status: string;
    phase?: string | null;
    progress?: number | null;
    error_code?: string | null;
    error_message?: string | null;
    files_json?: unknown;
    plan_json?: unknown;
  } | null;
}

type Tab = 'preview' | 'code' | 'logs';

function statusLabel(status: string): string {
  switch (status) {
    case 'provisioning': return 'Provisioning';
    case 'ready': return 'Ready';
    case 'failed': return 'Failed';
    case 'expired': return 'Expired';
    default: return status;
  }
}

// Module-level icon map — stable references, no dynamic component creation during render.
const STATUS_ICONS: Record<string, (typeof Loader2)> = {
  ready: CheckCircle2,
  failed: AlertTriangle,
  expired: X,
  provisioning: Clock,
};

// Derive file list directly from props — no effect, no setState-in-effect.
function deriveFiles(build: PreviewOwnerClientProps['build']): { path: string; content: string }[] {
  const filesJson = build?.files_json;
  if (!Array.isArray(filesJson)) return [];
  return (filesJson as { path: string; content: unknown }[]).map((f) => ({
    path: f.path,
    content: typeof f.content === 'string' ? f.content : JSON.stringify(f.content, null, 2) ?? '',
  }));
}

export default function PreviewOwnerClient({
  previewId,
  buildId,
  previewStatus,
  sandboxUrl,
  expiresAt,
  build,
}: PreviewOwnerClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const files = deriveFiles(build);

  const isReady = previewStatus === 'ready';
  const isTerminal = ['failed', 'expired'].includes(previewStatus);
  const StatusIcon = STATUS_ICONS[previewStatus] ?? Loader2;

  const tabItems: { id: Tab; label: string; Icon: typeof Layout }[] = [
    { id: 'preview', label: 'Preview', Icon: Layout },
    { id: 'code', label: 'Code', Icon: Code2 },
    { id: 'logs', label: 'Logs', Icon: List },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon size={16} strokeWidth={2} className={previewStatus === 'failed' ? 'text-destructive' : isReady ? 'text-primary' : 'text-warning'} aria-hidden="true" />
            <span className="text-sm font-medium">{statusLabel(previewStatus)}</span>
            {expiresAt && (
              <span className="text-xs text-muted-foreground ml-2">
                Expires {new Date(expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {isReady && sandboxUrl && (
              <Button size="sm" variant="outline" onClick={() => window.open(sandboxUrl, '_blank')}>
                <Play size={14} /> Open in new tab
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Raw sandbox URLs are isolated but not private/revocable yet. */}
      {isReady && (
        <p className="shrink-0 border-b border-warning/30 bg-warning-surface px-3 py-2 text-xs text-warning sm:px-4">
          Development preview: do not enter credentials or sensitive client data.
          The sandbox address is unlisted, not access-controlled at its own origin.
          Sharing is disabled.
        </p>
      )}
      {/* Tabs */}
      <div className="shrink-0 border-b border-border bg-chrome px-3 py-2 sm:px-4">
        <div className="flex gap-1" role="group" aria-label="Build output">
          {tabItems.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant="ghost"
              aria-pressed={activeTab === t.id}
              className="min-w-0 flex-1 gap-1.5 text-xs aria-pressed:bg-accent aria-pressed:font-semibold aria-pressed:text-accent-foreground"
              onClick={() => setActiveTab(t.id)}
            >
              <t.Icon size={14} strokeWidth={1.5} aria-hidden="true" />
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'preview' && (
          <PreviewTab
            isReady={isReady}
            isTerminal={isTerminal}
            sandboxUrl={sandboxUrl}
            previewStatus={previewStatus}
            device={device}
            setDevice={setDevice}
          />
        )}
        {activeTab === 'code' && <CodeTab files={files} />}
        {activeTab === 'logs' && <LogsTab build={build} />}
      </div>
    </div>
  );
}

function PreviewTab({
  isReady,
  isTerminal,
  sandboxUrl,
  previewStatus,
  device,
  setDevice,
}: {
  isReady: boolean;
  isTerminal: boolean;
  sandboxUrl?: string;
  previewStatus: string;
  device: 'desktop' | 'mobile';
  setDevice: (d: 'desktop' | 'mobile') => void;
}) {
  if (isTerminal) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle size={40} strokeWidth={1.5} className="mb-4 text-warning" aria-hidden="true" />
        <h3 className="text-lg font-medium">Preview {statusLabel(previewStatus)}</h3>
        <p className="text-sm text-muted-foreground mt-2">
          The sandbox is not available. Check the Logs tab for details.
        </p>
      </div>
    );
  }

  if (!isReady || !sandboxUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <Clock size={40} strokeWidth={1.5} className="mb-4 text-primary" aria-hidden="true" />
        <h3 className="text-lg font-medium">Provisioning preview…</h3>
        <p className="text-sm text-muted-foreground mt-2">
          The sandbox is being created. This can take a few minutes.
        </p>
      </div>
    );
  }

  const isMobile = device === 'mobile';

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center bg-chrome p-3 sm:p-4">
      <div className="mb-3 flex shrink-0 gap-2" role="group" aria-label="Preview size">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={isMobile}
          className="gap-1.5 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          onClick={() => setDevice('mobile')}
        >
          <Smartphone size={12} strokeWidth={1.5} />
          Mobile
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={!isMobile}
          className="gap-1.5 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
          onClick={() => setDevice('desktop')}
        >
          <Monitor size={12} strokeWidth={1.5} />
          Desktop
        </Button>
      </div>
      <div
        className="relative mx-auto min-h-0 w-full max-w-2xl shrink-0 overflow-hidden rounded-xl border border-border bg-black"
        style={{
          maxWidth: isMobile ? '22rem' : undefined,
          aspectRatio: isMobile ? 9 / 16 : 16 / 9,
        }}
      >
        <iframe
          src={sandboxUrl}
          title="Lattice preview"
          className="absolute inset-0 w-full h-full"
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-forms"
        />
      </div>
    </div>
  );
}

function CodeTab({
  files,
}: {
  files: { path: string; content: string }[];
}) {
  const [selectedFile, setSelectedFile] = useState('');
  const file = files.find((f) => f.path === selectedFile) ?? files[0];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col md:flex-row">
      {/* File tree */}
      <div className="flex max-h-32 shrink-0 flex-col border-b border-border bg-chrome md:max-h-none md:w-48 md:border-r md:border-b-0">
        <div className="shrink-0 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
          Files
        </div>
        <div className="overflow-y-auto flex-1">
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              title={f.path}
              aria-pressed={file?.path === f.path}
              onClick={() => setSelectedFile(f.path)}
              className="w-full truncate px-3 py-2 text-left font-mono text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-offset-[-2px] aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              {f.path}
            </button>
          ))}
        </div>
      </div>

      {/* Source viewer */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
        {file ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-chrome px-3 py-2 font-mono text-xs text-muted-foreground">
              <span className="min-w-0 truncate" title={file.path}>{file.path}</span>
              <span>{(file.content.match(/\n/g) || []).length + 1} lines</span>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed text-foreground">
              {file.content}
            </pre>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            No files available.
          </div>
        )}
      </div>
    </div>
  );
}

function LogsTab({ build }: { build: PreviewOwnerClientProps['build'] }) {
  const filesList: { path?: string }[] =
    build?.files_json && Array.isArray(build.files_json)
      ? (build.files_json as { path?: string }[])
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      <Card>
        <CardHeader>
          <CardTitle>Build lifecycle</CardTitle>
          <CardDescription className="break-all">
            Build {build?.build_id ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-medium ${build?.status === 'completed' ? 'text-primary' : build?.status === 'failed' ? 'text-destructive' : 'text-warning'}`}>
              {build?.status ?? 'unknown'}
            </span>
          </div>
          {build?.phase && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Phase</span>
              <span className="font-mono text-xs">{build.phase}</span>
            </div>
          )}
          {build?.progress != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-mono text-xs">{build.progress}%</span>
            </div>
          )}
          {build?.error_code && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Error code</span>
              <span className="font-mono text-xs text-destructive">{build.error_code}</span>
            </div>
          )}
          {build?.error_message && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Error message</div>
              <div className="break-all whitespace-pre-wrap rounded bg-danger-surface p-3 font-mono text-xs text-destructive">
                {build.error_message}
              </div>
            </div>
          )}
          {filesList.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Generated files</span>
              <span className="font-mono text-xs">{filesList.length}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sandbox lifecycle</CardTitle>
          <CardDescription>
            Sandbox provisioning, install, build, and startup diagnostics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Sandbox logs require a live sandbox. Run a provisioning smoke test to
            populate install, compile, and startup logs here.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            Generated source files from the build
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filesList.length > 0 ? (
            <ul className="space-y-1">
              {filesList.map((f) => (
                <li key={f.path} className="break-all font-mono text-sm text-muted-foreground">
                  {f.path ?? 'unknown'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No generated files.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
