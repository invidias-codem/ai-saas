"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VaultData, VaultConversation } from "@/lib/conversations/vault";
import {
    Archive,
    Trash2,
    RotateCcw,
    MessageSquare,
    Loader2,
    ArrowLeft,
    Calendar,
    Search,
    Vault as VaultIcon
} from "lucide-react";

type FilterType = 'all' | 'active' | 'archived' | 'deleted';

export function VaultManager({ initialData }: { initialData: VaultData }) {
    const router = useRouter();
    const locale = useLocale();
    const [data, setData] = useState<VaultData>(initialData);
    const [filter, setFilter] = useState<FilterType>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // Re-fetch when filter changes (server prefetched 'all').
    useEffect(() => {
        if (filter === 'all') {
            setData(initialData);
            return;
        }
        let cancelled = false;
        const fetchVault = async () => {
            try {
                const response = await fetch(`/api/conversations/vault?filter=${filter}`, {
                    credentials: 'include'
                });
                if (response.ok) {
                    const result = await response.json();
                    if (!cancelled) setData(result);
                }
            } catch (error) {
                console.error('Error fetching vault:', error);
            }
        };
        fetchVault();
        return () => { cancelled = true; };
    }, [filter, initialData]);

    const handleRestore = async (id: string) => {
        try {
            setActionLoading(id);
            setActionError(null);
            const response = await fetch(`/api/conversations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ restore: true })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Restore failed (${response.status})`);
            }
            setData(prev => ({
                ...prev,
                conversations: prev.conversations.map(c =>
                    c.id === id ? { ...c, isDeleted: false } : c
                ),
                counts: { ...prev.counts, deleted: prev.counts.deleted - 1, active: prev.counts.active + 1 }
            }));
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Restore failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleArchive = async (id: string, currentlyArchived: boolean) => {
        try {
            setActionLoading(id);
            setActionError(null);
            const response = await fetch(`/api/conversations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ isArchived: !currentlyArchived })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Archive failed (${response.status})`);
            }
            setData(prev => ({
                ...prev,
                conversations: prev.conversations.map(c =>
                    c.id === id ? { ...c, isArchived: !currentlyArchived } : c
                )
            }));
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Archive failed');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setActionLoading(id);
            setActionError(null);
            const response = await fetch(`/api/conversations/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || `Delete failed (${response.status})`);
            }
            setData(prev => ({
                ...prev,
                conversations: prev.conversations.map(c =>
                    c.id === id ? { ...c, isDeleted: true } : c
                ),
                counts: { ...prev.counts, deleted: prev.counts.deleted + 1, active: prev.counts.active - 1 }
            }));
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Delete failed');
        } finally {
            setActionLoading(null);
        }
    };

    // Canonical conversation route (slice-2): /{locale}/conversation/{id}
    const openConversation = (id: string) => {
        router.push(`/${locale}/conversation/${id}`);
    };

    const filteredConversations = data.conversations.filter(c => {
        if (!searchQuery) return true;
        return c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.preview?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const tabs: { id: FilterType; label: string; count: number }[] = [
        { id: 'all', label: 'All', count: data.counts.all },
        { id: 'active', label: 'Active', count: data.counts.active },
        { id: 'archived', label: 'Archived', count: data.counts.archived },
        { id: 'deleted', label: 'Deleted', count: data.counts.deleted },
    ];

    return (
        <div className="px-4 lg:px-8 space-y-3 sm:space-y-4">
            <Button variant="ghost" onClick={() => router.push(`/${locale}/settings`)} className="mb-2">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Settings
            </Button>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 sm:py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
            </div>

            <div className="flex gap-2 border-b pb-2 overflow-x-auto scrollbar-none">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setFilter(tab.id)}
                        className={cn(
                            "px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap shrink-0",
                            filter === tab.id
                                ? "bg-amber-600 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        )}
                    >
                        {tab.label}
                        <span className="ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 rounded-full text-xs bg-white/20">
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {actionError && (
                <Card className="p-3 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                    {actionError}
                </Card>
            )}

            {filteredConversations.length === 0 ? (
                <Card className="p-8 text-center">
                    <VaultIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500">No conversations found</p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredConversations.map(conv => (
                        <Card
                            key={conv.id}
                            className={cn(
                                "p-4 transition hover:shadow-md cursor-pointer",
                                conv.isDeleted && "opacity-60 bg-red-50",
                                conv.isArchived && !conv.isDeleted && "bg-gray-50"
                            )}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div
                                    className="flex-1 min-w-0"
                                    onClick={() => !conv.isDeleted && openConversation(conv.id)}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-medium truncate">{conv.title}</h3>
                                        {conv.isArchived && !conv.isDeleted && (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600">Archived</span>
                                        )}
                                        {conv.isDeleted && (
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-red-200 text-red-600">Deleted</span>
                                        )}
                                        {conv.isDeleted && conv.daysUntilPurge !== undefined && (
                                            <span className={cn(
                                                "px-2 py-0.5 text-xs rounded-full",
                                                conv.daysUntilPurge <= 7 ? "bg-orange-200 text-orange-700" : "bg-yellow-100 text-yellow-700"
                                            )}>
                                                {conv.daysUntilPurge} days left
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 truncate mb-2">
                                        {conv.preview || 'No messages'}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <MessageSquare className="w-3 h-3" />
                                            {conv.messageCount} messages
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {formatDate(conv.lastUpdated)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {conv.isDeleted ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => { e.stopPropagation(); handleRestore(conv.id); }}
                                            disabled={actionLoading === conv.id}
                                            className="text-green-600 border-green-200 hover:bg-green-50"
                                        >
                                            {actionLoading === conv.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <><RotateCcw className="w-4 h-4 mr-1" />Restore</>
                                            )}
                                        </Button>
                                    ) : (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => { e.stopPropagation(); handleArchive(conv.id, conv.isArchived); }}
                                                disabled={actionLoading === conv.id}
                                                title={conv.isArchived ? "Unarchive" : "Archive"}
                                            >
                                                <Archive className={cn("w-4 h-4", conv.isArchived && "text-amber-600")} />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
                                                disabled={actionLoading === conv.id}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
