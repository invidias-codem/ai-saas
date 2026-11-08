// app/[locale]/(dashboard)/(routes)/previews/[previewId]/client.tsx
// Phase 8D: Owner-only preview client component.
// Preview / Code / Logs tabs with responsive desktop/mobile layout.
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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

function statusIcon(status: string) {
  switch (status) {
    case 'ready': return CheckCircle2;
    case 'failed': return AlertTriangle;
    case 'expired': return X;
    case 'provisioning': return Clock;
    default: return Loader2;
  }
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
  const [files, setFiles] = useState<{ path: string; content: string }[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('app/page.tsx');

  useEffect(() => {
    const filesJson = build?.files_json;
    if (Array.isArray(filesJson)) {
      const parsed = filesJson.map((f: any) => ({
        path: f.path,
        content: typeof f.content === 'string' ? f.content : JSON.stringify(f.content, null, 2),
      }));
      setFiles(parsed);
      if (parsed.length > 0 && !parsed.find((f) => f.path === selectedFile)) {
        setSelectedFile(parsed[0].path);
      }
    }
  }, [build, selectedFile]);

  const isReady = previewStatus === 'ready';
  const isTerminal = ['failed', 'expired'].includes(previewStatus);
  const StatusIcon = statusIcon(previewStatus);

  const tabItems: { id: Tab; label: string; Icon: any }[] = [
    { id: 'preview', label: 'Preview', Icon: Layout },
    { id: 'code', label: 'Code', Icon: Code2 },
    { id: 'logs', label: 'Logs', Icon: List },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-4 py-3 bg-background/50 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon size={16} strokeWidth={2} />
            <span className="text-sm font-medium">{statusLabel(previewStatus)}</span>
            {expiresAt && (
              <span className="text-xs text-muted-foreground ml-2">
                Expires {new Date(expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => window.location.reload()}>
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

      {/* Tabs */}
      <div className="border-b px-4">
        <div className="flex gap-1">
          {tabItems.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={activeTab === t.id ? 'default' : 'outline'}
              className="flex-1 text-xs font-normal gap-2"
              onClick={() => setActiveTab(t.id)}
            >
              <t.Icon size={14} strokeWidth={1.5} />
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'preview' && (
          <PreviewTab
            isReady={isReady}
            isTerminal={isTerminal}
            sandboxUrl={sandboxUrl}
            previewStatus={previewStatus}
          />
        )}
        {activeTab === 'code' && <CodeTab files={files} selectedFile={selectedFile} setSelectedFile={setSelectedFile} />}
        {activeTab === 'logs' && <LogsTab build={build} />}
      </main>
    </div>
  );
}

function PreviewTab({
  isReady,
  isTerminal,
  sandboxUrl,
  previewStatus,
}: {
  isReady: boolean;
  isTerminal: boolean;
  sandboxUrl?: string;
  previewStatus: string;
}) {
  if (isTerminal) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle size={48} strokeWidth={2} className="text-muted-foreground mb-4" />
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
        <Clock size={48} strokeWidth={2} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Provisioning preview…</h3>
        <p className="text-sm text-muted-foreground mt-2">
          The sandbox is being created. This can take a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0a0a0a]">
      <iframe
        src={sandboxUrl}
        title="Lattice preview"
        className="w-full h-full"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}

function CodeTab({
  files,
  selectedFile,
  setSelectedFile,
}: {
  files: { path: string; content: string }[];
  selectedFile: string;
  setSelectedFile: (path: string) => void;
}) {
  const file = files.find((f) => f.path === selectedFile);

  return (
    <div className="h-full flex flex-col">
      {/* File tree */}
      <div className="border-r bg-muted/50 flex-none w-1/4 flex flex-col">
        <div className="p-3 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Files
        </div>
        <div className="overflow-y-auto flex-1">
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelectedFile(f.path)}
              className={`w-full text-left px-4 py-2 text-xs border-b border-b-muted/30 hover:bg-muted/50 ${
                selectedFile === f.path ? 'bg-muted text-accent-foreground' : ''
              }`}
            >
              {f.path}
            </button>
          ))}
        </div>
      </div>

      {/* Source viewer */}
      <div className="flex-1 flex flex-col bg-background">
        {file ? (
          <div className="flex-1 overflow-hidden">
            <div className="border-b bg-muted/30 px-3 py-1 text-[10px] font-mono text-muted-foreground flex items-center justify-between">
              <span>{file.path}</span>
              <span>{(file.content.match(/\n/g) || []).length + 1} lines</span>
            </div>
            <div className="flex-1 overflow-auto p-3 font-mono text-xs text-foreground leading-relaxed whitespace-pre break-all">
              {file.content}
            </div>
          </div>
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
    <div className="h-full p-4 overflow-y-auto">
      <Card>
        <CardHeader>
          <CardTitle>Build lifecycle</CardTitle>
          <CardDescription>
            Build {build?.build_id ?? '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-medium ${build?.status === 'completed' ? 'text-green-600' : build?.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
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
              <span className="font-mono text-xs text-red-600">{build.error_code}</span>
            </div>
          )}
          {build?.error_message && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Error message</div>
              <div className="bg-muted p-3 rounded text-xs font-mono text-red-400 whitespace-pre-wrap break-all">
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
          <CardTitle>Files</CardTitle>
          <CardDescription>
            Generated source files from the build
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filesList.length > 0 ? (
            <ul className="space-y-1">
              {filesList.map((f) => (
                <li key={f.path} className="text-sm font-mono text-muted-foreground">
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
