"use client"

import React, { useState, useEffect, useRef } from "react"
import { Upload, FileType, Check, AlertCircle, Loader2, Shield, Lock, EyeOff } from "lucide-react"
import { ImportPreview } from "@/components/ImportPreview"
import { cn } from "@/lib/utils"
import type { GenieUniversalImport, PreviewableParser } from "@/lib/types/imports"

// --- Types ---

type Platform = "openai" | "anthropic" | "gemini" | "perplexity" | "manus" | "other"

interface ImportStats {
    conversationsFound: number
    messagesParsed: number
    memoriesExtracted: number
}

interface FileMetadata {
    name: string
    size: number
    type: string
    detectedPlatform?: Platform
}

interface ImportProcessResponse {
    jobId: string;
    stats: {
        facts: number;
        memories: number;
    };
}

type WizardStage = "upload" | "confirmation" | "processing" | "extracting" | "complete"

interface DataImportWizardProps {
    onComplete?: () => void
}

// --- Main Component ---

export function DataImportWizard({ onComplete }: DataImportWizardProps) {
    const [stage, setStage] = useState<WizardStage>("upload")
    const [_file, setFile] = useState<File | null>(null) // TODO: Used for backend upload in startImport()
    const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null)
    const [isDragOver, setIsDragOver] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Progress State
    const [logs, setLogs] = useState<string[]>([])
    const [stats, setStats] = useState<ImportStats>({
        conversationsFound: 0,
        messagesParsed: 0,
        memoriesExtracted: 0
    })

    // New state for extraction results
    const [extractionStats, setExtractionStats] = useState<{
        facts: number;
        memories: number;
        topics: number;
    } | null>(null)

    const [parsedData, setParsedData] = useState<GenieUniversalImport | null>(null)

    // Refs for cleanup
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const timeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Cleanup interval and timeout on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [])

    // --- Handlers ---

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
    }

    const detectPlatform = (fileName: string): Platform => {
        const lower = fileName.toLowerCase()
        if (lower.includes("conversations.json")) return "openai"
        if (lower.includes("takeout")) return "gemini"
        if (lower.includes("claude")) return "anthropic"
        if (lower.endsWith(".json")) return "openai" // Fallback
        return "other"
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)

        const droppedFile = e.dataTransfer.files[0]
        if (!droppedFile) return

        processFile(droppedFile)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0])
        }
    }

    const processFile = async (file: File) => {
        setIsAnalyzing(true)
        setFile(file)
        setError(null)
        setLogs([])

        try {
            let platform = detectPlatform(file.name)

            let json: any = null

            // Only try parsing JSON if it is a JSON file
            if (file.name.toLowerCase().endsWith('.json')) {
                const text = await file.text()
                try {
                    json = JSON.parse(text)
                } catch (e) {
                    throw new Error("Invalid JSON file")
                }
            } else if (file.name.toLowerCase().endsWith('.zip')) {
                setLogs(prev => [...prev, "Reading ZIP archive..."]);
                try {
                    const JSZip = (await import('jszip')).default;
                    const zip = new JSZip();
                    const contents = await zip.loadAsync(file);

                    let targetFile: any = null;

                    // Strategy 1: Look for specific known filenames
                    const knownFiles = ['conversations.json', 'chat.json', 'history.json', 'data.json'];
                    for (const name of knownFiles) {
                        // Search recursively or just check root?
                        // JSZip keys are full paths.
                        const found = Object.keys(contents.files).find(path => path.toLowerCase().endsWith(name));
                        if (found) {
                            targetFile = contents.files[found];
                            setLogs(prev => [...prev, `Found known import file: ${found}`]);
                            break;
                        }
                    }

                    // Strategy 2: If no known file, find the largest JSON file
                    if (!targetFile) {
                        setLogs(prev => [...prev, "Searching for usable JSON data..."]);
                        let maxSize = 0;
                        Object.keys(contents.files).forEach(path => {
                            if (!path.startsWith('__MACOSX') && !contents.files[path].dir && path.toLowerCase().endsWith('.json')) {
                                // JSZip doesn't give size easily without stat, but we can assume main file is relevant.
                                // Actually _data is internal.
                                // Let's just take the first json that looks "root" like or just any json.
                                // Better: look for one containing "conversation" in name
                                if (path.toLowerCase().includes('conversation') || path.toLowerCase().includes('chat')) {
                                    targetFile = contents.files[path];
                                }
                            }
                        });

                        // Fallback: Just take the first JSON file found if still null
                        if (!targetFile) {
                            const firstJson = Object.keys(contents.files).find(path =>
                                !path.startsWith('__MACOSX') && !contents.files[path].dir && path.toLowerCase().endsWith('.json')
                            );
                            if (firstJson) targetFile = contents.files[firstJson];
                        }
                    }

                    if (targetFile) {
                        setLogs(prev => [...prev, `Extracting ${targetFile.name}...`]);
                        const text = await targetFile.async('text');
                        json = JSON.parse(text);
                        // Update detected platform hint based on internal file path if possible
                        if (targetFile.name.includes('Takeout')) platform = 'gemini';
                    } else {
                        throw new Error("No valid JSON import file found inside the ZIP archive.");
                    }

                } catch (zipErr: any) {
                    console.error("ZIP Error:", zipErr);
                    throw new Error(`Failed to read ZIP file: ${zipErr.message || "Unknown error"}`);
                }
            } else {
                // Fallback for truly unknown JSON
                throw new Error("Unsupported file format - Please upload .json or .zip")
            }

            // Client-side Preview/Validation Logic (JSON Only)
            if (json) {
                // Dynamic Parser Loading with error handling
                let OpenAIParser, AnthropicParser, GeminiParser, PerplexityParser, ManusParser;
                try {
                    ({ OpenAIParser } = await import('@/lib/import/parsers/openai'));
                    ({ AnthropicParser } = await import('@/lib/import/parsers/anthropic'));
                    ({ GeminiParser } = await import('@/lib/import/parsers/gemini'));
                    ({ PerplexityParser } = await import('@/lib/import/parsers/perplexity'));
                    ({ ManusParser } = await import('@/lib/import/parsers/manus'));
                } catch (importError) {
                    console.error('[DataImportWizard] Parser import failed:', importError);
                    throw new Error('Failed to load import parsers. Please refresh and try again.');
                }

                const parsers = [
                    new OpenAIParser(),
                    new AnthropicParser(),
                    new GeminiParser(),
                    new PerplexityParser(),
                    new ManusParser()
                ]

                let detectedParser = parsers.find(p => p.platform === platform)

                // If specific detection failed or we want to try all parsers to be safe (auto-detect)
                if (!detectedParser && platform === 'other') {
                    for (const p of parsers) {
                        if (p.validateFormat(json)) {
                            detectedParser = p
                            platform = p.platform
                            break
                        }
                    }
                }

                if (detectedParser) {
                    // Use preview method if available (OpenAIParser)
                    const isPreviewable = (parser: any): parser is PreviewableParser => {
                        return 'preview' in parser && typeof parser.preview === 'function';
                    };

                    if (platform === 'openai' && isPreviewable(detectedParser)) {
                        // Cast to OpenAIParser or specific interface if we had one, but we know it has preview
                        const previewResult = detectedParser.preview(json);

                        if (!previewResult.valid) {
                            throw new Error(`File does not match expected ${platform} format`)
                        }

                        // Parse full data for the preview component
                        const result = detectedParser.parse(json)
                        setParsedData(result)

                        setStats({
                            conversationsFound: previewResult.counts.conversations,
                            messagesParsed: previewResult.counts.messages,
                            memoriesExtracted: 0 // logic for this later
                        })

                    } else {
                        // Standard flow for other parsers
                        if (!detectedParser.validateFormat(json)) {
                            // Try others before failing
                            let recovered = false
                            for (const p of parsers) {
                                if (p !== detectedParser && p.validateFormat(json)) {
                                    detectedParser = p
                                    platform = p.platform
                                    recovered = true
                                    break
                                }
                            }
                            if (!recovered) {
                                throw new Error(`File does not match expected ${platform} format`)
                            }
                        }

                        const result = detectedParser.parse(json)
                        setParsedData(result)

                        let msgCount = 0
                        result.conversations.forEach(c => msgCount += c.messages.length)

                        setStats({
                            conversationsFound: result.conversations.length,
                            messagesParsed: msgCount,
                            memoriesExtracted: 0
                        })
                    }
                } else {
                    throw new Error("Could not detect a supported platform format for this JSON file")
                }
            } else {
                // Fallback for truly unknown JSON
                throw new Error("Unsupported file format")
            }

            setFileMeta({
                name: file.name,
                size: file.size,
                type: file.type,
                detectedPlatform: platform
            })

            setTimeout(() => {
                setIsAnalyzing(false)
                setStage("confirmation")
            }, 800)

        } catch (err: any) {
            console.error(err)
            setError(err.message || "Failed to process file")
            setIsAnalyzing(false)
        }
    }

    const startImport = async () => {
        setStage("processing")
        setLogs(prev => [...prev, "Initiating secure chat import..."])

        try {
            if (!parsedData || !parsedData.conversations) throw new Error("No data to import");

            const BATCH_SIZE = 20; // Send 20 conversations at a time
            const totalConversations = parsedData.conversations.length;
            const batches = Math.ceil(totalConversations / BATCH_SIZE);
            let jobId = null;

            let totalFacts = 0;
            let totalMemories = 0;

            for (let i = 0; i < batches; i++) {
                const start = i * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, totalConversations);
                const batchConversations = parsedData.conversations.slice(start, end);

                setLogs(prev => [...prev, `Processing batch ${i + 1}/${batches} (${start}-${end})...`])

                // Construct partial import data
                const batchImportData = {
                    ...parsedData,
                    conversations: batchConversations
                };

                // Call the import processing API
                const response: Response = await fetch('/api/import/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        importData: batchImportData,
                        jobId, // Pass previous jobId to append/link
                        options: {
                            fileName: fileMeta?.name || 'unknown-export',
                            totalConversations
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json() as { error?: string };
                    throw new Error(errorData.error || `Batch ${i + 1} failed`);
                }

                const result: ImportProcessResponse = await response.json();
                jobId = result.jobId; // Capture ID from first batch

                totalFacts += result.stats.facts;
                totalMemories += result.stats.memories;

                // Visual feedback speedup
                await new Promise(r => setTimeout(r, 200));
            }

            setLogs(prev => [...prev, "Knowledge extraction complete."])
            setLogs(prev => [...prev, `Stored ${totalMemories} new memories.`])

            setExtractionStats({
                facts: totalFacts,
                memories: totalMemories,
                topics: 0 // Topics aggregation is complex in batch, skip for now
            });

            setStage("complete")
            setLogs(prev => [...prev, "Import Successfully Completed."])

            // Invoke callback
            timeoutRef.current = setTimeout(() => onComplete?.(), 0)

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Failed to import data";
            console.error("Import error:", err);
            setError(errorMessage);
            setStage("upload");
        }
    }

    const reset = () => {
        setStage("upload")
        setFile(null)
        setFileMeta(null)
        setLogs([])
        setError(null)
        setParsedData(null)
        setStats({ conversationsFound: 0, messagesParsed: 0, memoriesExtracted: 0 })
        setExtractionStats(null)
    }

    // --- Render Helpers ---

    const renderPlatformIcon = (platform?: Platform) => {
        switch (platform) {
            case "openai": return <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">OA</div>
            case "anthropic": return <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">An</div>
            case "gemini": return <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">Ge</div>
            case "perplexity": return <div className="w-12 h-12 bg-teal-500 rounded-full flex items-center justify-center text-white font-bold">Px</div>
            case "manus": return <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">Ma</div>
            default: return <div className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center text-white font-bold">?</div>
        }
    }

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    // --- Render Stages ---

    if (stage === "upload") {
        return (
            <div className="w-full max-w-2xl mx-auto p-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent mb-2">
                        Universal Import
                    </h2>
                    <p className="text-muted-foreground">
                        Drag & drop your export file from OpenAI, Anthropic, Gemini, or others.
                    </p>
                </div>

                <div
                    className={cn(
                        "relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ease-in-out",
                        isDragOver ? "border-primary bg-primary/5 scale-105" : "border-border bg-card hover:bg-muted/50",
                        isAnalyzing ? "opacity-50 pointer-events-none" : "",
                        error ? "border-red-500/50 bg-red-500/5" : ""
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleFileSelect}
                        accept=".json,.zip"
                    />

                    <div className="flex flex-col items-center gap-4 pointer-events-none">
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                                <p className="text-xl font-medium text-foreground">Analyzing file structure...</p>
                                <p className="text-sm text-muted-foreground">Detecting platform format...</p>
                            </>
                        ) : (
                            <>
                                <div className={cn(
                                    "w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-colors",
                                    error ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
                                )}>
                                    {error ? <AlertCircle className="w-10 h-10" /> : <Upload className="w-10 h-10" />}
                                </div>

                                {error ? (
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold text-red-500">Processing Failed</h3>
                                        <p className="text-red-400/80 text-sm max-w-sm mx-auto">{error}</p>
                                        <p className="text-xs text-muted-foreground mt-4">Click to try again</p>
                                    </div>
                                ) : (
                                    <>
                                        <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                                            Import Chat History
                                        </h3>
                                        <p className="text-muted-foreground max-w-sm mx-auto">
                                            Drag & drop your export file here. <br />
                                            We support OpenAI (conversations.json).
                                        </p>
                                        <div className="flex gap-2 mt-4 text-xs text-muted-foreground/60 font-mono">
                                            <span>.json</span>
                                            <span>•</span>
                                            <span>.zip</span>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Trust Indicators (Compact) */}
                <div className="flex justify-center gap-8 mt-8 opacity-60 hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Lock className="w-3 h-3" /> Encrypted
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Shield className="w-3 h-3" /> Private
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <EyeOff className="w-3 h-3" /> No Training
                    </div>
                </div>
            </div>
        )
    }

    if (stage === "confirmation") {
        return (
            <div className="w-full max-w-2xl mx-auto p-6 bg-card border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold">Import Summary</h2>
                        <p className="text-muted-foreground">Ready to import from <span className="font-semibold text-primary capitalize">{fileMeta?.detectedPlatform}</span>.</p>
                    </div>
                    <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">
                        Cancel
                    </button>
                </div>

                <div className="bg-muted/30 rounded-lg p-6 mb-6 border border-border/50">
                    <div className="flex items-center gap-6 mb-6">
                        {renderPlatformIcon(fileMeta?.detectedPlatform)}

                        <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg capitalize">{fileMeta?.detectedPlatform} Export</h3>
                                <div className="flex gap-2">
                                    <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full font-mono">
                                        VERIFIED
                                    </span>
                                    <span className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full font-mono">
                                        {fileMeta && formatFileSize(fileMeta.size)}
                                    </span>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground break-all">
                                {fileMeta?.name}
                            </p>
                        </div>
                    </div>

                    {/* Extraction Stats Grid */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-card p-4 rounded-lg border shadow-sm text-center transform transition-transform hover:scale-105">
                            <div className="text-3xl font-bold text-foreground mb-1">{stats.conversationsFound}</div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Conversations</div>
                        </div>
                        <div className="bg-card p-4 rounded-lg border shadow-sm text-center transform transition-transform hover:scale-105">
                            <div className="text-3xl font-bold text-primary mb-1">{stats.messagesParsed}</div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Messages</div>
                        </div>
                        <div className="bg-card p-4 rounded-lg border shadow-sm text-center transform transition-transform hover:scale-105">
                            <div className="text-3xl font-bold text-purple-500 mb-1">
                                {stats.messagesParsed > 0 ? "Ready" : "0"}
                            </div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Memory Engine</div>
                        </div>
                    </div>
                </div>


                {
                    parsedData && (
                        <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                            <h3 className="text-sm font-semibold mb-2">Content Preview</h3>
                            <ImportPreview data={parsedData} />
                        </div>
                    )
                }

                <button
                    onClick={startImport}
                    className="w-full py-4 bg-primary text-primary-foreground rounded-lg font-bold text-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                    <FileType className="w-5 h-5" />
                    Start Import Process
                </button>

                <p className="text-center text-xs text-muted-foreground mt-4">
                    Your data is processed locally first and encrypted before storage.
                </p>
            </div >
        )
    }

    if (stage === "processing" || stage === "complete") {
        return (
            <div className="w-full max-w-2xl mx-auto p-6 bg-card border rounded-xl shadow-2xl">
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        {stage === 'processing' ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                <span className="animate-pulse">Importing...</span>
                            </>
                        ) : (
                            <>
                                <Check className="w-6 h-6 text-green-500" />
                                Import Complete
                            </>
                        )}
                    </h2>
                    {extractionStats && stage === 'complete' && (
                        <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
                            <span className="bg-primary/10 text-primary px-2 py-1 rounded-md font-mono">
                                +{extractionStats.facts} Facts
                            </span>
                            <span className="bg-purple-500/10 text-purple-500 px-2 py-1 rounded-md font-mono">
                                +{extractionStats.memories} Memories
                            </span>
                        </div>
                    )}
                </div>

                {/* Console Logs */}
                <div className="bg-black/90 rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto border border-white/10 flex flex-col-reverse">
                    {/* Flex col reverse keeps scroll at bottom usually, but simple mapping is fine too */}
                    <div>
                        {logs.map((log, i) => (
                            <div key={i} className="text-green-400 mb-1 flex gap-2">
                                <span className="opacity-50 select-none">
                                    {">"}
                                </span>
                                {log}
                            </div>
                        ))}
                        {stage === 'processing' && (
                            <div className="text-green-400/50 animate-pulse">_</div>
                        )}
                    </div>
                </div>

                {stage === "complete" && (
                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={reset}
                            className="flex-1 py-3 border border-border rounded-lg font-medium hover:bg-muted transition-colors"
                        >
                            Import Another
                        </button>
                        <button
                            onClick={() => onComplete ? onComplete() : window.history.back()}
                            className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-opacity"
                        >
                            Finish
                        </button>
                    </div>
                )}
            </div>
        )
    }

    return null
}
