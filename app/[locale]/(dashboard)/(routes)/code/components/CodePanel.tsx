'use client';

// CodePanel — displays Claude's generated code files with a file tree + code viewer.

import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useClipboard } from 'use-clipboard-copy';
import type { GeneratedFile } from '@/lib/ucol/types';
import { Loader2, FileCode, FolderOpen, Copy, Check, Download } from 'lucide-react';

interface CodePanelProps {
    files: GeneratedFile[];
    loading: boolean;
}

// Map common extensions to SyntaxHighlighter language keys
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

    // Filter out scaffold files for the tree, but keep them accessible
    const codeFiles = files.filter(f => f.component !== '_scaffold');
    const scaffoldFiles = files.filter(f => f.component === '_scaffold');

    const selectedFile = files.find(f => f.path === activeFile) || codeFiles[0] || null;

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
                        </>
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
        </div>
    );
}
