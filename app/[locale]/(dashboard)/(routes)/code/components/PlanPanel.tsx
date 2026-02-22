'use client';

// PlanPanel — displays Gemini's architectural plan.

import type { ProjectPlan } from '@/lib/ucol/types';
import { Loader2, Layers, FileCode, Database, Globe } from 'lucide-react';

interface PlanPanelProps {
    plan: ProjectPlan | null;
    loading: boolean;
}

export function PlanPanel({ plan, loading }: PlanPanelProps) {
    return (
        <div className="flex-1 flex flex-col border border-zinc-800/60 rounded-xl overflow-hidden bg-zinc-950/50">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800/60 bg-zinc-900/40">
                <div className="h-5 w-5 rounded bg-blue-500/15 flex items-center justify-center">
                    <Layers className="h-3 w-3 text-blue-400" />
                </div>
                <span className="text-xs font-semibold text-zinc-300 tracking-wide">Gemini Plan</span>
                {loading && <Loader2 className="h-3 w-3 text-blue-400 animate-spin ml-auto" />}
                {plan && (
                    <span className="text-[10px] text-zinc-600 ml-auto font-mono">
                        {plan.components.length} components
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading && !plan && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-400/50" />
                        <p className="text-xs">Gemini is planning the architecture...</p>
                    </div>
                )}

                {!loading && !plan && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
                        <Layers className="h-8 w-8 text-zinc-700" />
                        <p className="text-xs">Architecture plan will appear here</p>
                    </div>
                )}

                {plan && (
                    <>
                        {/* App name + description */}
                        <div>
                            <h3 className="text-sm font-bold text-zinc-100">{plan.appName}</h3>
                            <p className="text-xs text-zinc-400 mt-0.5">{plan.description}</p>
                        </div>

                        {/* Tech Stack */}
                        <div className="flex flex-wrap gap-1.5">
                            {plan.techStack.map((tech, i) => (
                                <span key={i} className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                                    {tech}
                                </span>
                            ))}
                        </div>

                        {/* Pages */}
                        {plan.pages && plan.pages.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Globe className="h-3 w-3 text-zinc-500" />
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Pages</span>
                                </div>
                                <div className="space-y-1.5">
                                    {plan.pages.map((page, i) => (
                                        <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-900/40 rounded-lg border border-zinc-800/40">
                                            <span className="text-xs text-zinc-300 font-medium">{page.name}</span>
                                            <span className="text-[10px] text-zinc-600 font-mono">{page.route}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Components */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <FileCode className="h-3 w-3 text-zinc-500" />
                                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Components</span>
                            </div>
                            <div className="space-y-1.5">
                                {plan.components.map((comp, i) => (
                                    <div key={i} className="px-2.5 py-2 bg-zinc-900/40 rounded-lg border border-zinc-800/40">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-zinc-300 font-medium">{comp.name}</span>
                                            <span className="text-[10px] text-zinc-600 font-mono">{comp.filePath}</span>
                                        </div>
                                        <p className="text-[10px] text-zinc-500 mt-0.5">{comp.description}</p>
                                        {comp.dependencies.length > 0 && (
                                            <div className="flex gap-1 mt-1.5">
                                                <span className="text-[9px] text-zinc-600">deps:</span>
                                                {comp.dependencies.map((dep, j) => (
                                                    <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70 font-mono">
                                                        {dep}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Data Model */}
                        {plan.dataModel && plan.dataModel.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Database className="h-3 w-3 text-zinc-500" />
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Data Model</span>
                                </div>
                                <div className="space-y-1.5">
                                    {plan.dataModel.map((model, i) => (
                                        <div key={i} className="px-2.5 py-2 bg-zinc-900/40 rounded-lg border border-zinc-800/40">
                                            <span className="text-xs text-zinc-300 font-medium">{model.name}</span>
                                            <div className="mt-1 space-y-0.5">
                                                {model.fields.map((field, j) => (
                                                    <div key={j} className="flex items-center gap-2 text-[10px]">
                                                        <span className="text-zinc-400 font-mono">{field.name}</span>
                                                        <span className="text-zinc-600">:</span>
                                                        <span className="text-purple-400/70 font-mono">{field.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reasoning */}
                        {plan.reasoning && (
                            <div className="mt-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                                <span className="text-[10px] font-semibold text-blue-400/70 uppercase tracking-wider">Gemini&apos;s Reasoning</span>
                                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{plan.reasoning}</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
