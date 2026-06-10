"use client"

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Trash2, Edit2, Save, X, Search, Brain, Calendar, Clock, BarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Memory {
    id: string;
    content: string;
    type: string;
    createdAt: string;
    scope?: string;
}

interface MemoryAnalytics {
    totalFacts: number;
    expiringFactsCount: number;
    factsByType: Record<string, number>;
}

export function MemoryControlPanel() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [analytics, setAnalytics] = useState<MemoryAnalytics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [activeTab, setActiveTab] = useState<string>("all");

    // Pagination
    const [offset, setOffset] = useState(0);
    const LIMIT = 100;
    const [hasMore, setHasMore] = useState(true);

    const parentRef = useRef<HTMLDivElement>(null);

    const fetchAnalytics = async () => {
        try {
            const res = await fetch("/api/memory/analytics");
            if (res.ok) {
                const data = await res.json();
                setAnalytics(data);
            }
        } catch (error) {
            console.error("Failed to fetch memory analytics", error);
        }
    };

    const fetchMemories = useCallback(async (reset = false) => {
        if (reset) setIsLoading(true);
        try {
            const currentOffset = reset ? 0 : offset;
            const res = await fetch(`/api/memory/list?limit=${LIMIT}&offset=${currentOffset}`);
            if (res.ok) {
                const data = await res.json();
                if (reset) {
                    setMemories(data.memories);
                    setOffset(LIMIT);
                } else {
                    setMemories(prev => [...prev, ...data.memories]);
                    setOffset(prev => prev + LIMIT);
                }
                setHasMore(data.memories.length === LIMIT);
            }
        } catch (error) {
            console.error("Failed to fetch memories", error);
        } finally {
            setIsLoading(false);
        }
    }, [LIMIT, offset]);

    useEffect(() => {
        fetchAnalytics();
        fetchMemories(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to forget this memory?")) return;
        try {
            const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setMemories(prev => prev.filter(m => m.id !== id));
                fetchAnalytics(); // Refresh stats
            }
        } catch (error) {
            console.error("Failed to delete memory", error);
        }
    };

    const handleEditStart = (memory: Memory) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
    };

    const handleEditSave = async (id: string) => {
        try {
            const res = await fetch(`/api/memory/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent })
            });

            if (res.ok) {
                setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
                setEditingId(null);
            }
        } catch (error) {
            console.error("Failed to update memory", error);
        }
    };

    const filteredMemories = memories.filter(m => {
        const matchesSearch = m.content.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTab = activeTab === "all" || m.type === activeTab;
        return matchesSearch && matchesTab;
    });

    const virtualizer = useVirtualizer({
        count: filteredMemories.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 140, // rough height of a memory card
        overscan: 5,
    });

    const categories = ["all", "general", "preference", "personal_info", "question", "decision"];
    const topCategory = analytics?.factsByType ? Object.entries(analytics.factsByType).sort((a, b) => b[1] - a[1])[0]?.[0] : null;

    return (
        <div className="w-full mx-auto space-y-6">
            {/* Header Analytics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card border rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-primary/10 rounded-lg text-primary">
                        <Brain className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-medium">Total Memories</p>
                        <h3 className="text-2xl font-bold">{analytics?.totalFacts ?? "-"}</h3>
                    </div>
                </div>
                <div className="bg-card border rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-amber-500/10 rounded-lg text-amber-500">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-medium">Expiring Soon</p>
                        <h3 className="text-2xl font-bold">{analytics?.expiringFactsCount ?? 0}</h3>
                    </div>
                </div>
                <div className="bg-card border rounded-xl p-4 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
                        <BarChart className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground font-medium">Top Category</p>
                        <h3 className="text-2xl font-bold capitalize">{topCategory ? topCategory.replace('_', ' ') : "-"}</h3>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 h-[600px] border rounded-xl overflow-hidden bg-background">
                {/* Vertical Sidebar Tabs */}
                <div className="w-full md:w-64 border-b md:border-b-0 md:border-r bg-muted/20 p-4 overflow-y-auto">
                    <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">Categories</h3>
                    <div className="space-y-1">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveTab(cat)}
                                className={cn(
                                    "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors",
                                    activeTab === cat ? "bg-primary text-primary-foreground font-medium shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <span className="capitalize">{cat.replace('_', ' ')}</span>
                                {analytics?.factsByType && cat !== "all" && (
                                    <span className={cn("text-xs py-0.5 px-2 rounded-full", activeTab === cat ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/10")}>
                                        {analytics.factsByType[cat] || 0}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="p-4 border-b">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder={`Search ${activeTab === 'all' ? 'all memories' : activeTab.replace('_', ' ') + ' memories'}...`}
                                className="w-full pl-9 pr-4 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div ref={parentRef} className="flex-1 overflow-auto p-4 relative" style={{ contain: 'strict' }}>
                        {isLoading && filteredMemories.length === 0 ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : filteredMemories.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                                <Brain className="w-12 h-12 mb-4 opacity-20" />
                                <p>No memories found in this category.</p>
                            </div>
                        ) : (
                            <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                                {virtualizer.getVirtualItems().map((virtualItem) => {
                                    const memory = filteredMemories[virtualItem.index];
                                    return (
                                        <div
                                            key={virtualItem.key}
                                            data-index={virtualItem.index}
                                            ref={virtualizer.measureElement}
                                            className="absolute top-0 left-0 w-full"
                                            style={{ transform: `translateY(${virtualItem.start}px)` }}
                                        >
                                            <div className="mb-4 bg-card border rounded-lg p-4 transition-all hover:border-primary/50 shadow-sm mx-1">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        {editingId === memory.id ? (
                                                            <textarea
                                                                className="w-full p-3 border rounded-md min-h-[100px] bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                                value={editContent}
                                                                onChange={(e) => setEditContent(e.target.value)}
                                                            />
                                                        ) : (
                                                            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{memory.content}</p>
                                                        )}
                                                        <div className="mt-3 text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                                                            <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md font-medium capitalize text-foreground/80">
                                                                {memory.type.replace('_', ' ')}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                                {new Date(memory.createdAt).toLocaleDateString()}
                                                            </span>
                                                            {memory.scope && (
                                                                <span className={cn("px-2 py-1 rounded-md capitalize", memory.scope === "persistent" ? "bg-blue-500/10 text-blue-600" : "bg-muted")}>
                                                                    {memory.scope}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {editingId === memory.id ? (
                                                            <>
                                                                <button onClick={() => handleEditSave(memory.id)} className="p-2 hover:bg-green-500/10 text-green-600 rounded-md transition-colors" title="Save">
                                                                    <Save className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => setEditingId(null)} className="p-2 hover:bg-red-500/10 text-red-600 rounded-md transition-colors" title="Cancel">
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => handleEditStart(memory)} className="p-2 hover:bg-primary/10 text-primary rounded-md transition-colors" title="Edit">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => handleDelete(memory.id)} className="p-2 hover:bg-destructive/10 text-destructive rounded-md transition-colors" title="Forget">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {hasMore && !isLoading && !searchQuery && activeTab === 'all' && (
                            <div className="pt-4 pb-8 flex justify-center">
                                <button
                                    onClick={() => fetchMemories(false)}
                                    className="px-6 py-2 border border-dashed rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                >
                                    Load More Memories
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
