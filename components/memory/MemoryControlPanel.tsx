
"use client"

import React, { useState, useEffect } from "react";
import { Loader2, Trash2, Edit2, Save, X, Search, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface Memory {
    id: string;
    content: string;
    type: string;
    createdAt: string;
}

export function MemoryControlPanel() {
    const [memories, setMemories] = useState<Memory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");

    // Pagination
    const [offset, setOffset] = useState(0);
    const LIMIT = 20;
    const [hasMore, setHasMore] = useState(true);

    const fetchMemories = async (reset = false) => {
        setIsLoading(true);
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
    };

    useEffect(() => {
        fetchMemories(true);
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to forget this memory?")) return;

        try {
            const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setMemories(prev => prev.filter(m => m.id !== id));
            }
        } catch (error) {
            console.error("Failed to delete memory", error);
        }
    };

    const handleEditStart = (memory: Memory) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
    };

    const handleEditCancel = () => {
        setEditingId(null);
        setEditContent("");
    };

    const handleEditSave = async (id: string) => {
        try {
            const res = await fetch(`/api/memory/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent })
            });

            if (res.ok) {
                setMemories(prev => prev.map(m =>
                    m.id === id ? { ...m, content: editContent } : m
                ));
                setEditingId(null);
            }
        } catch (error) {
            console.error("Failed to update memory", error);
        }
    };

    const filteredMemories = memories.filter(m =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Brain className="w-6 h-6 text-primary" />
                        Memory Center
                    </h2>
                    <p className="text-muted-foreground">Manage what Genie knows about you.</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search memories..."
                        className="pl-9 pr-4 py-2 border rounded-md bg-background"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-4">
                {filteredMemories.map(memory => (
                    <div key={memory.id} className="bg-card border rounded-lg p-4 transition-all hover:border-primary/50">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                {editingId === memory.id ? (
                                    <textarea
                                        className="w-full p-2 border rounded-md min-h-[100px] bg-background"
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                    />
                                ) : (
                                    <p className="text-sm leading-relaxed">{memory.content}</p>
                                )}
                                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                                    <span className="bg-muted px-2 py-0.5 rounded capitalize">{memory.type.replace('_', ' ')}</span>
                                    <span>•</span>
                                    <span>{new Date(memory.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {editingId === memory.id ? (
                                    <>
                                        <button onClick={() => handleEditSave(memory.id)} className="p-2 hover:bg-green-500/10 text-green-500 rounded-md transition-colors" title="Save">
                                            <Save className="w-4 h-4" />
                                        </button>
                                        <button onClick={handleEditCancel} className="p-2 hover:bg-red-500/10 text-red-500 rounded-md transition-colors" title="Cancel">
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
                ))}

                {isLoading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                )}

                {!isLoading && filteredMemories.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>No memories found.</p>
                    </div>
                )}

                {hasMore && !isLoading && !searchQuery && (
                    <button
                        onClick={() => fetchMemories(false)}
                        className="w-full py-4 border border-dashed rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                        Load More
                    </button>
                )}
            </div>
        </div>
    );
}
