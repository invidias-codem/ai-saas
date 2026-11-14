'use client';

// CodePanel — displays Claude's generated code files with a file tree + code viewer + live preview.
// Hybrid preview: frontend esbuild-wasm fast-path for UI-only builds, backend quarantine for full-stack.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SyntaxHighlighter from "react-syntax-highlighter/dist/cjs/prism";
import { vs, vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { useClipboard } from "use-clipboard-copy";
import type { GeneratedFile } from "@/lib/ucol/types";
import { Loader2, FileCode, FolderOpen, Copy, Check, Download, Play, X, Smartphone, Monitor, Maximize2 } from "lucide-react";
import { useTranspiler } from "@/lib/bundler/useTranspiler";
import { transpileProject } from "@/lib/bundler";
import { useTheme } from "@/hooks/use-theme";

interface CodePanelProps {
    files: GeneratedFile[];
    loading: boolean;
    /** Owner-authorized preview backed by a completed durable build. */
    onSandboxPreview?: () => Promise<void>;
    sandboxPreviewPending?: boolean;
    /** User-facing reason when no authorized isolated sandbox is available. */
    previewUnavailableReason?: string | null;
    /** Never execute generated HTML/JS on the Lattice application origin. */
    disableLegacyBackendPreview?: boolean;
}

function isFrontendOnly(files: GeneratedFile[]): boolean {
    // Only actual generated source files count toward the frontend/backend
    // decision — scaffold configs (next.config.js, tailwind, postcss) always
    // ship with every build and must not force the backend sandbox path.
    const codeFiles = files.filter(f => f.component !== '_scaffold');
    const backendIndicators = [
        /\/api\//i,
        /\/server\//i,
        /\/trpc\//i,
        /\/pages\/api\//i,
        /\/app\/api\//i,
        /server\.(ts|js|mjs|cjs)/i,
        /middleware\.(ts|js|mjs|cjs)/i,
        /\.env/i,
        /prisma/i,
        /drizzle/i,
        /express/i,
        /fastify/i,
        /hono/i,
        /go\.mod/i,
        /Cargo\.toml/i,
        /pyproject\.toml/i,
        /requirements\.txt/i,
        /Dockerfile/i,
        /docker-compose/i,
    ];

    return !codeFiles.some((f) => backendIndicators.some((re) => re.test(f.path)));
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

export function CodePanel({
    files, loading, onSandboxPreview, sandboxPreviewPending = false,
    previewUnavailableReason = null, disableLegacyBackendPreview = true,
}: CodePanelProps) {
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const clipboard = useClipboard({ copiedTimeout: 2000 });
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('desktop');
    const [creatingPreview, setCreatingPreview] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewInsufficientCredits, setPreviewInsufficientCredits] = useState(false);
    const [previewMode, setPreviewMode] = useState<'fast' | 'backend' | null>(null);
    const router = useRouter();
    const { compile, isReady, isTranspiling, error: transpilerError } = useTranspiler();

    // Filter out scaffold files for the tree, but keep them accessible
    const codeFiles = files.filter(f => f.component !== '_scaffold');
    const scaffoldFiles = files.filter(f => f.component === '_scaffold');

    const selectedFile = files.find(f => f.path === activeFile) || codeFiles[0] || null;

    // Model-generated language labels vary (e.g., "tsx" or "jsx"); do not
    // hide a completed React project merely because it isn't labelled "react".
    const hasPreviewable = files.some(f =>
        ['html', 'css', 'javascript', 'js', 'typescript', 'ts', 'react', 'tsx', 'jsx'].includes(f.language.toLowerCase()) ||
        /\.(tsx|jsx|ts|js|html|css)$/i.test(f.path)
    );

    const frontendFastPath = isFrontendOnly(files);
    const { isDark } = useTheme();

    function buildRunnerCode(bundledJS: string) {
        // esbuild outputs an ESM bundle for the automatic JSX runtime.
        // We keep React on the page so the render call can use createElement.
        // The bundle already imports react/jsx-runtime internally.
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

            // Bundle the WHOLE generated app into a self-mounting module so
            // the preview renders the running app, not a single component.
            const bundledJS = await transpileProject(
                files.map(f => ({ path: f.path, content: f.content }))
            );
            if (!bundledJS) {
                throw new Error(transpilerError || 'Bundling failed');
            }

            const html = buildReactPreviewHtml(bundledJS);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            setPreviewOpen(true);
        } catch (err: any) {
            setPreviewError(err.message || 'Frontend preview failed');
        } finally {
            setCreatingPreview(false);
        }
    }

    function buildReactPreviewHtml(moduleCode: string) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #ffffff; }
    #preview-host, #root { width: 100%; height: 100%; min-height: 100vh; }
  </style>
  <script>
    window.addEventListener('error', function(evt) {
      parent.postMessage({ type: 'preview-error', message: evt.message, filename: evt.filename, lineno: evt.lineno }, '*');
    });
    window.addEventListener('unhandledrejection', function(evt) {
      var reason = evt.reason && evt.reason.message ? evt.reason.message : String(evt.reason);
      parent.postMessage({ type: 'preview-error', message: reason }, '*');
    });
  </script>
</head>
<body>
  <div id="preview-host"></div>
  <script type="module">
    try {
      ${moduleCode}
    } catch (err) {
      parent.postMessage({ type: 'preview-error', message: err && err.message ? err.message : String(err) }, '*');
      document.getElementById('preview-host').textContent = 'Preview error: ' + (err && err.message ? err.message : String(err));
    }
  </script>
</body>
</html>`;
    }

    function buildCssPreviewHtml(css: string) {
        return buildPreviewDocument(`
            <style>${escapeHtml(css)}</style>
            <div id="root">Preview</div>
        `);
    }

    function buildHtmlPreviewHtml(html: string) {
        return buildPreviewDocument(`
            <div id="root">${escapeHtml(html)}</div>
        `);
    }

    function buildPreviewDocument(body: string) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: transparent; }
    #root { width: 100%; height: 100%; }
  </style>
  <script>
    window.addEventListener('error', function(evt) {
      parent.postMessage({ type: 'preview-error', message: evt.message }, '*');
    });
    window.addEventListener('unhandledrejection', function(evt) {
      var reason = evt.reason && evt.reason.message ? evt.reason.message : String(evt.reason);
      parent.postMessage({ type: 'preview-error', message: reason }, '*');
    });
  </script>
</head>
<body>
  ${body}
</body>
</html>`;
    }

    function escapeHtml(value: string) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function openPreview() {
        if (onSandboxPreview) {
            await onSandboxPreview();
            return;
        }
        if (previewUnavailableReason) {
            setPreviewError(previewUnavailableReason);
            return;
        }
        if (!hasPreviewable) {
            setPreviewError('This build has no previewable web files yet.');
            return;
        }
        if (disableLegacyBackendPreview) {
            setPreviewError('An isolated sandbox is required for previewing this app.');
            return;
        }

        // Default the preview frame to the viewer's actual form factor
        if (typeof window !== 'undefined') {
            setPreviewDevice(window.innerWidth < 768 ? 'mobile' : 'desktop');
        }

        if (frontendFastPath && isReady) {
            await openFrontendPreview();
        } else if (frontendFastPath && !isReady) {
            setPreviewError('Compiler engine not ready yet');
        } else {
            setPreviewError('Backend previews now require an isolated Code Builder sandbox.');
        }
    }

    function closePreview() {
        setPreviewOpen(false);
        setPreviewUrl(null);
        setPreviewError(null);
        setPreviewInsufficientCredits(false);
        setPreviewMode(null);
    }

    useEffect(() => {
        if (!previewOpen) return;

        const handler = (event: MessageEvent) => {
            if (event.data && event.data.type === 'preview-error') {
                setPreviewError(event.data.message || 'Preview runtime error');
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [previewOpen]);

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
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-chrome px-3 py-2.5">
                <div className="h-5 w-5 rounded bg-accent flex items-center justify-center">
                    <FileCode className="h-3 w-3 text-accent-foreground" />
                </div>
                <span className="text-xs font-semibold text-foreground tracking-wide">Claude Code</span>
                {loading && <Loader2 className="h-3 w-3 text-accent-foreground motion-safe:animate-spin ml-1" />}
                <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
                    {files.length > 0 && (
                        <>
                            <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{files.length} files</span>
                            <button
                                type="button"
                                aria-label="Download generated files"
                                onClick={handleDownloadAll}
                                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                                <Download className="h-3 w-3" />
                            </button>
                            {hasPreviewable && (
                                <button
                                    type="button"
                                    onClick={openPreview}
                                    disabled={creatingPreview || sandboxPreviewPending}
                                    aria-label={onSandboxPreview ? 'Open isolated app preview' : 'Check preview availability'}
                                    title={previewUnavailableReason || 'Open isolated app preview'}
                                    className="flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground hover:bg-chrome transition-colors"
                                >
                                    {creatingPreview || sandboxPreviewPending ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                    <span>Preview</span>
                                </button>
                            )}
                        </>
                    )}
                    {previewInsufficientCredits && (
                        <button
                            onClick={() => router.push("/pricing")}
                            className="max-w-[220px] truncate text-[10px] text-warning hover:underline"
                            title="Get more credits to unlock live preview"
                        >
                            Insufficient credits for preview · Upgrade
                        </button>
                    )}
                    {previewMode && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                            {previewMode === 'fast' ? 'fast-path' : 'backend'}
                        </span>
                    )}
                </div>
            </div>

            {previewError && !previewInsufficientCredits && (
                <div role="status" className="shrink-0 border-b border-warning/30 bg-warning-surface px-3 py-2 text-xs text-warning">
                    {previewError}
                </div>
            )}
            {/* Body */}
            <div className="flex-1 flex overflow-hidden">
                {/* File tree sidebar (md+ only — mobile uses chip strip below) */}
                {files.length > 0 && (
                    <div className="hidden w-36 shrink-0 overflow-y-auto border-r border-border bg-chrome lg:block xl:w-40">
                        {/* Code files */}
                        {Array.from(groups.entries()).map(([dir, dirFiles]) => (
                            <div key={dir}>
                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                                    <FolderOpen className="h-3 w-3" />
                                    <span className="truncate" title={dir}>{dir}</span>
                                </div>
                                {dirFiles.map(file => (
                                    <button
                                        key={file.path}
                                        type="button"
                                        aria-pressed={selectedFile?.path === file.path}
                                        title={file.path}
                                        onClick={() => setActiveFile(file.path)}
                                        className={`w-full truncate px-4 py-1.5 text-left font-mono text-[11px] transition-colors focus-visible:outline-offset-[-2px] ${selectedFile?.path === file.path
                                                ? 'bg-accent text-accent-foreground border-r-2 border-accent-foreground/30'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-chrome'
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
                                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-2 border-t border-border pt-2">
                                    <FolderOpen className="h-3 w-3" />
                                    config
                                </div>
                                {scaffoldFiles.map(file => (
                                    <button
                                        key={file.path}
                                        type="button"
                                        aria-pressed={selectedFile?.path === file.path}
                                        title={file.path}
                                        onClick={() => setActiveFile(file.path)}
                                        className={`w-full truncate px-4 py-1.5 text-left font-mono text-[11px] transition-colors focus-visible:outline-offset-[-2px] ${selectedFile?.path === file.path
                                                ? 'border-r-2 border-primary/30 bg-accent text-accent-foreground'
                                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {/* Mobile file chip strip */}
                    {files.length > 0 && (
                        <div className="flex flex-none gap-1.5 overflow-x-auto border-b border-border bg-chrome px-3 py-2 lg:hidden">
                            {[...codeFiles, ...scaffoldFiles].map(file => (
                                <button
                                    key={file.path}
                                    type="button"
                                    aria-pressed={selectedFile?.path === file.path}
                                    onClick={() => setActiveFile(file.path)}
                                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-mono border transition-colors ${selectedFile?.path === file.path
                                        ? 'bg-accent text-accent-foreground border-accent-foreground/30'
                                        : 'text-muted-foreground border-border hover:text-foreground'
                                        }`}
                                >
                                    {file.path.split('/').pop()}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 overflow-auto">
                    {loading && files.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                            <Loader2 className="h-8 w-8 motion-safe:animate-spin text-accent-foreground" />
                            <p className="text-xs">Claude is generating code...</p>
                        </div>
                    )}

                    {!loading && files.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                            <FileCode className="h-8 w-8 text-muted-foreground" />
                            <p className="text-xs">Generated code will appear here</p>
                        </div>
                    )}

                    {selectedFile && (
                        <div className="relative h-full">
                            {/* File header */}
                            <div className="sticky top-0 left-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-chrome px-3 py-1.5">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate font-mono text-[11px] text-muted-foreground" title={selectedFile.path}>{selectedFile.path}</span>
                                    <span className="hidden rounded bg-accent px-1.5 py-0.5 font-mono text-[9px] text-accent-foreground sm:inline">
                                        {selectedFile.model}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => clipboard.copy(selectedFile.content)}
                                    className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
                                style={isDark ? vscDarkPlus : vs}
                                customStyle={{
                                    margin: 0,
                                    padding: '1rem',
                                    fontSize: '0.75rem',
                                    lineHeight: '1.5',
                                    background: 'transparent',
                                    minHeight: '100%',
                                }}
                                showLineNumbers
                                lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: 'var(--muted-foreground)' }}
                            >
                                {selectedFile.content}
                            </SyntaxHighlighter>
                        </div>
                    )}
                    </div>
                </div>
            </div>

            {previewOpen && previewUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
                    <div className="w-full h-full max-w-[100vw] max-h-[100dvh] bg-background border border-border sm:rounded-xl overflow-hidden flex flex-col sm:m-4">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-chrome">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground">Live Preview</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{previewDevice}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{previewMode}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPreviewDevice(previewDevice === 'mobile' ? 'desktop' : 'mobile')}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                >
                                    {previewDevice === 'mobile' ? <Monitor className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                                    <span className="hidden sm:inline">{previewDevice === 'mobile' ? 'Desktop' : 'Mobile'}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        const w = window.open(previewUrl || '', '_blank');
                                        if (!w) setPreviewError('Popup blocked');
                                    }}
                                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                >
                                    <Maximize2 className="h-3 w-3" />
                                    <span className="hidden sm:inline">Open</span>
                                </button>
                                <button onClick={closePreview} className="text-muted-foreground hover:text-foreground">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 bg-white flex items-start justify-center">
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
