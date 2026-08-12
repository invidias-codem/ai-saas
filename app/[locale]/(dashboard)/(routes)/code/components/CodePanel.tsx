'use client';

// CodePanel — displays Claude's generated code files with a file tree + code viewer + live preview.
// Hybrid preview: frontend esbuild-wasm fast-path for UI-only builds, backend quarantine for full-stack.

import { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/prism';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { useClipboard } from 'use-clipboard-copy';
import type { GeneratedFile } from '@/lib/ucol/types';
import { Loader2, FileCode, FolderOpen, Copy, Check, Download, Play, X, Smartphone, Monitor, Maximize2 } from 'lucide-react';
import { useProModal } from '@/hooks/use-pro-modal';
import { useTranspiler } from '@/lib/bundler/useTranspiler';

interface CodePanelProps {
    files: GeneratedFile[];
    loading: boolean;
}

function isFrontendOnly(files: GeneratedFile[]): boolean {
    // Escalate to backend sandbox when any file indicates server-side intent
    const backendIndicators = [
        /\/api\//i,
        /\/server\//i,
        /\/middleware\//i,
        /\/trpc\//i,
        /\/pages\/api\//i,
        /\/app\/api\//i,
        /server\.(ts|js|mjs|cjs)/i,
        /middleware\.(ts|js|mjs|cjs)/i,
        /\.env/i,
        /prisma/i,
        /drizzle/i,
        /next\.config/i,
        /express/i,
        /fastify/i,
        /hono/i,
        /node_modules/i,
        /native/i,
        /go\.mod/i,
        /Cargo\.toml/i,
        /pyproject\.toml/i,
        /requirements\.txt/i,
        /Dockerfile/i,
        /docker-compose/i,
    ];

    return !files.some((f) => backendIndicators.some((re) => re.test(f.path)));
}

function mapLanguage(lang: string): string {
    const map: Record<string, string> = {
        tsx: 'tsx',
        ts: 'typescript',
        jsx: 'jsx',
        js: 'javascript',
        javascript: 'javascript',
        typescript: 'typescript',
        css: 'css',
        json: 'json',
        html: 'html',
    };
    return map[lang.toLowerCase()] || lang;
}

export function CodePanel({ files, loading }: CodePanelProps) {
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const clipboard = useClipboard({ copiedTimeout: 2000 });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('desktop');
    const [creatingPreview, setCreatingPreview] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewInsufficientCredits, setPreviewInsufficientCredits] = useState(false);
    const [previewMode, setPreviewMode] = useState<'fast' | 'backend' | null>(null);
    const proModal = useProModal();
    const { compile, isReady, isTranspiling, error: transpilerError } = useTranspiler();

    // Filter out scaffold files for the tree, but keep them accessible
    const codeFiles = files.filter(f => f.component !== '_scaffold');
    const scaffoldFiles = files.filter(f => f.component === '_scaffold');

    const selectedFile = files.find(f => f.path === activeFile) || codeFiles[0] || null;

    const hasPreviewable = files.some(f => ['html','css','javascript','typescript','react'].includes(f.language));

    const frontendFastPath = isFrontendOnly(files);

    function buildRunnerCode(bundledJS: string) {
        return `
            import React from 'https://esm.sh/react@18.2.0';
            import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';

            ${bundledJS}

            const root = createRoot(document.getElementById('root'));
            root.render(React.createElement(App));
        `;
    }

    async function openFrontendPreview() {
        if (!frontendFastPath) return;
        try {
            setCreatingPreview(true);
            setPreviewError(null);
            setPreviewMode('fast');
            setPreviewInsufficientCredits(false);

            const primary = files.find(f => ['html','javascript','typescript','react','css'].includes(f.language)) || files[0];
            const bundledJS = await compile(primary.content);
            if (!bundledJS) {
                throw new Error(transpilerError || 'Transpilation failed');
            }

            const runnerCode = buildRunnerCode(bundledJS);
            const blob = new Blob([runnerCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            setPreviewOpen(true);
        } catch (err: any) {
            setPreviewError(err.message || 'Frontend preview failed');
        } finally {
            setCreatingPreview(false);
        }
    }

    async function openBackendPreview() {
        if (frontendFastPath) return;
        try {
            setCreatingPreview(true);
            setPreviewError(null);
            setPreviewMode('backend');
            setPreviewInsufficientCredits(false);

            const primary = files.find(f => ['html','javascript','typescript','react','css'].includes(f.language)) || files[0];
            const body: any = {
                code: primary.content,
                language: primary.language,
            };
            const res = await fetch('/api/preview/render', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include',
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 402) {
                    setPreviewInsufficientCredits(true);
                    return;
                }
                setPreviewInsufficientCredits(false);
                throw new Error(data?.error || `Preview creation failed: ${res.status}`);
            }
            setPreviewInsufficientCredits(false);
            const data = await res.json();
            setPreviewUrl(data.previewUrl || `/api/preview/render?id=${data.id}`);
            setPreviewOpen(true);
        } catch (err: any) {
            setPreviewError(err.message || 'Failed to open preview');
        } finally {
            setCreatingPreview(false);
        }
    }

    async function openPreview() {
        if (!hasPreviewable) return;

        if (frontendFastPath && isReady) {
            await openFrontendPreview();
        } else if (frontendFastPath && !isReady) {
            setPreviewError('Compiler engine not ready yet');
        } else {
            await openBackendPreview();
        }
    }

    function closePreview() {
        setPreviewOpen(false);
        setPreviewUrl(null);
        setPreviewError(null);
        setPreviewInsufficientCredits(false);
        setPreviewMode(null);
    }

    // Build a simple grouped tree
    const groups = new Map<string, GeneratedFile[]>();
    for (const file of codeFiles) {
        const dir = file.path.split('/').slice(0, -1).join('/') || '.';
        if (!groups.has(dir)) groups.set(dir, []);
        groups.get(dir)!.push(file);
    }

    const handleDownloadAll = () => {
        const allCode = files.map(f => `// === ${f.path} ===\n${f.content}`).join('\n\n');
        const blob = new Blob([allCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'generated-project.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex-1 flex flex-col border border-zinc-800/60 rounded-xl overflow-hidden bg-zinc-950/50">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/40">
                <div className="h-5 w-5 rounded bg-orange-500/15 flex items-center justify-center">
                    <FileCode className="h-3 w-3 text-orange-400" />
                </div>
                <span className="text-xs font-semibold text-zinc-300 tracking-wide">Claude Code</span>
                {loading && <Loader2 className="h-3 w-3 text-orange-400 animate-spin ml-1" />}
                <div className="ml-auto flex items-center gap-2">
                    {files.length > 0 && (
                        <>
                            <span className="text-[10px] text-zinc-600 font-mono">{files.length} files</span>
                            <button
                                onClick={handleDownloadAll}
                                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <Download className="h-3 w-3" />
                            </button>
                            {hasPreviewable && (
                                <button
                                    onClick={openPreview}
                                    disabled={creatingPreview}
                                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    {creatingPreview ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                    <span className="hidden sm:inline">Preview</span>
                                </button>
                            )}
                        </>
                    )}
                    {previewInsufficientCredits && (
                        <button
                            onClick={() => proModal.onOpen()}
                            className="text-[10px] text-amber-300 hover:text-amber-200 transition-colors max-w-[220px] truncate"
                            title="Get more credits to unlock live preview"
                        >
                            Insufficient credits for preview · Upgrade
                        </button>
                    )}
                    {previewError && !previewInsufficientCredits && (
                        <div className="text-[10px] text-red-400 max-w-[180px] truncate" title={previewError}>{previewError}</div>
                    )}
                    {previewMode && (
                        <span className="text-[10px] text-zinc-600 font-mono">
                            {previewMode === 'fast' ? 'fast-path' : 'backend'}
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden">
                {/* File tree sidebar */}
                {files.length > 0 && (
                    <div className="w-48 shrink-0 border-r border-zinc-800/60 overflow-y-auto bg-zinc-950/40">
                        {/* Code files */}
                        {Array.from(groups.entries()).map(([dir, dirFiles]) => (
                            <div key={dir}>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
                                    <FolderOpen className="h-3 w-3" />
                                    {dir}
                                </div>
                                {dirFiles.map(file => (
                                    <button
                                        key={file.path}
                                        onClick={() => setActiveFile(file.path)}
                                        className={`w-full text-left px-4 py-1.5 text-[11px] font-mono transition-colors ${selectedFile?.path === file.path
                                                ? 'bg-orange-500/10 text-orange-300 border-r-2 border-orange-400'
                                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60'
                                            }`}
                                    >
                                        {file.path.split('/').pop()}
                                    </button>
                                ))}
                            </div>
                        ))}

                        {/* Scaffold files */}
                        {scaffoldFiles.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-zinc-600 font-mono uppercase tracking-wider mt-2 border-t border-zinc-800/40 pt-2">
                                    <FolderOpen className="h-3 w-3" />
                                    config
                                </div>
                                {scaffoldFiles.map(file => (
                                    <button
                                        key={file.path}
                                        onClick={() => setActiveFile(file.path)}
                                        className={`w-full text-left px-4 py-1.5 text-[11px] font-mono transition-colors ${selectedFile?.path === file.path
                                                ? 'bg-emerald-500/10 text-emerald-300 border-r-2 border-emerald-400'
                                                : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/60'
                                            }`}
                                    >
                                        {file.path.split('/').pop()}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Code viewer */}
                <div className="flex-1 overflow-auto">
                    {loading && files.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
                            <Loader2 className="h-8 w-8 animate-spin text-orange-400/50" />
                            <p className="text-xs">Claude is generating code...</p>
                        </div>
                    )}

                    {!loading && files.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                            <FileCode className="h-8 w-8 text-zinc-700" />
                            <p className="text-xs">Generated code will appear here</p>
                        </div>
                    )}

                    {selectedFile && (
                        <div className="relative h-full">
                            {/* File header */}
                            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800/40">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono text-zinc-400">{selectedFile.path}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/60 font-mono">
                                        {selectedFile.model}
                                    </span>
                                </div>
                                <button
                                    onClick={() => clipboard.copy(selectedFile.content)}
                                    className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    {clipboard.copied ? (
                                        <><Check className="h-3 w-3" /> Copied</>
                                    ) : (
                                        <><Copy className="h-3 w-3" /> Copy</>
                                    )}
                                </button>
                            </div>

                            {/* Syntax highlighted code */}
                            <SyntaxHighlighter
                                language={mapLanguage(selectedFile.language)}
                                style={vscDarkPlus}
                                customStyle={{
                                    margin: 0,
                                    padding: '1rem',
                                    fontSize: '0.8rem',
                                    lineHeight: '1.5',
                                    background: 'transparent',
                                    minHeight: '100%',
                                }}
                                showLineNumbers
                                lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#4a5568' }}
                            >
                                {selectedFile.content}
                            </SyntaxHighlighter>
                        </div>
                    )}
                </div>
            </div>

            {previewOpen && previewUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full h-full max-w-[100vw] max-h-[100dvh] bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-zinc-300">Live Preview</span>
                                <span className="text-[10px] text-zinc-600 font-mono">{previewDevice}</span>
                                <span className="text-[10px] text-zinc-600 font-mono">{previewMode}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewDevice(previewDevice === 'mobile' ? 'desktop' : 'mobile')}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                                >
                                    {previewDevice === 'mobile' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                                    <span className="hidden sm:inline">{previewDevice === 'mobile' ? 'Desktop' : 'Mobile'}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        const w = window.open(previewUrl || '', '_blank');
                                        if (!w) setPreviewError('Popup blocked');
                                    }}
                                    className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                                >
                                    <Maximize2 className="h-3 w-3" />
                                    <span className="hidden sm:inline">Open</span>
                                </button>
                                <button onClick={closePreview} className="text-zinc-500 hover:text-zinc-300">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 bg-white">
                            <iframe
                                src={previewUrl}
                                title="Live Preview"
                                sandbox="allow-scripts allow-forms"
                                allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; vr; xr-spatial-tracking"
                                className="w-full h-full border-0"
                                style={{ maxWidth: previewDevice === 'mobile' ? '390px' : '100%', margin: '0 auto' }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
