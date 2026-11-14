'use client';

// PlanPanel — displays the architectural plan.

import type { ProjectPlan } from '@/lib/ucol/types';
import { Loader2, Layers, FileCode, Database, Globe } from 'lucide-react';

interface PlanPanelProps {
    plan: ProjectPlan | null;
    loading: boolean;
}

export function PlanPanel({ plan, loading }: PlanPanelProps) {
    return (
        <div className="flex-1 flex flex-col border border-border rounded-xl overflow-hidden bg-background">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-chrome">
                <div className="h-5 w-5 rounded bg-accent flex items-center justify-center">
                    <Layers className="h-3 w-3 text-primary" />
                </div>
                <span className="text-xs font-semibold text-foreground tracking-wide">Architecture Plan</span>
                {loading && <Loader2 className="h-3 w-3 text-primary motion-safe:animate-spin ml-auto" />}
                {plan && (
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                        {plan.components.length} components
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading && !plan && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Loader2 className="h-8 w-8 motion-safe:animate-spin text-primary" />
                        <p className="text-xs">Planning the architecture...</p>
                    </div>
                )}

                {!loading && !plan && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                        <Layers className="h-8 w-8 text-muted-foreground" />
                        <p className="text-xs">Architecture plan will appear here</p>
                    </div>
                )}

                {plan && (
                    <>
                        {/* App name + description */}
                        <div>
                            <h3 className="text-sm font-bold text-foreground">{plan.appName}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                        </div>

                        {/* Tech Stack */}
                        <div className="flex flex-wrap gap-1.5">
                            {plan.techStack.map((tech, i) => (
                                <span key={i} className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-muted text-muted-foreground border border-border">
                                    {tech}
                                </span>
                            ))}
                        </div>

                        {/* Pages */}
                        {plan.pages && plan.pages.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Globe className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pages</span>
                                </div>
                                <div className="space-y-1.5">
                                    {plan.pages.map((page, i) => (
                                        <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-chrome rounded-lg border border-border">
                                            <span className="text-xs text-foreground font-medium">{page.name}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono">{page.route}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Components */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <FileCode className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Components</span>
                            </div>
                            <div className="space-y-1.5">
                                {plan.components.map((comp, i) => (
                                    <div key={i} className="px-2.5 py-2 bg-chrome rounded-lg border border-border">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-foreground font-medium">{comp.name}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono">{comp.filePath}</span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">{comp.description}</p>
                                        {comp.dependencies.length > 0 && (
                                            <div className="flex gap-1 mt-1.5">
                                                <span className="text-[9px] text-muted-foreground">deps:</span>
                                                {comp.dependencies.map((dep, j) => (
                                                    <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-primary font-mono">
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
                                    <Database className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Data Model</span>
                                </div>
                                <div className="space-y-1.5">
                                    {plan.dataModel.map((model, i) => (
                                        <div key={i} className="px-2.5 py-2 bg-chrome rounded-lg border border-border">
                                            <span className="text-xs text-foreground font-medium">{model.name}</span>
                                            <div className="mt-1 space-y-0.5">
                                                {model.fields.map((field, j) => (
                                                    <div key={j} className="flex items-center gap-2 text-[10px]">
                                                        <span className="text-muted-foreground font-mono">{field.name}</span>
                                                        <span className="text-muted-foreground">:</span>
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
                            <div className="mt-2 p-3 bg-accent border border-primary/30 rounded-lg">
                                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Gemini&apos;s Reasoning</span>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{plan.reasoning}</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
