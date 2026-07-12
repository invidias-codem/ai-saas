"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MessageSquare, Trash2, Plus, Loader2, MessageCircle, Layers3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    fetchConversations,
    deleteConversation,
    setActiveConversation,
} from "@/lib/conversationManager";
import { clearSessionMemoryStorage } from "@/lib/sessionClientMemory";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Conversation {
    id: string;
    workspaceId?: string | null;
    title: string;
    messageCount: number;
    createdAt: number;
    lastUpdated: number;
    isArchived: boolean;
    preview?: string;
}

function extractWorkspaceId(pathname: string | null): string | null {
    if (!pathname) return null;
    const match = pathname.match(/\/workspaces\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export function ConversationHistory({ onNavigate }: { onNavigate?: () => void }) {
    const router = useRouter();
    const pathname = usePathname();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);

    const activeWorkspaceId = useMemo(() => extractWorkspaceId(pathname), [pathname]);
    const isWorkspaceScopedView = Boolean(activeWorkspaceId);
    const activeId = pathname?.match(/\/conversation\/([^/]+)/)?.[1] ?? null;

    async function loadConversations() {
        setLoading(true);
        try {
            const result = await fetchConversations();
            if (result) {
                setConversations(result.conversations);
            }
        } catch (error) {
            console.error("Error loading conversations:", error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        // Initial data load on mount/route change — async fetch + setState.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadConversations();
    }, [pathname]);

    const visibleConversations = useMemo(() => {
        if (!activeWorkspaceId) return conversations;
        return conversations.filter((conv) => conv.workspaceId === activeWorkspaceId);
    }, [conversations, activeWorkspaceId]);

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const success = await deleteConversation(id);
            if (success) {
                setConversations((prev) => prev.filter((c) => c.id !== id));
                if (id === activeId) {
                    clearSessionMemoryStorage();
                    onNavigate?.();
                    if (activeWorkspaceId) {
                        router.push(`/workspaces/${activeWorkspaceId}/conversation`);
                    } else {
                        router.push('/conversation/new');
                    }
                }
            }
        } catch (error) {
            console.error("Error deleting conversation:", error);
        } finally {
            setDeletingId(null);
        }
    };

    const handleNewConversation = async () => {
        setCreatingNew(true);
        try {
            clearSessionMemoryStorage();
            if (activeWorkspaceId) {
                router.push(`/workspaces/${activeWorkspaceId}/conversation`);
            } else {
                router.push('/conversation/new');
            }
        } catch (error) {
            console.error("Error creating conversation:", error);
        } finally {
            setCreatingNew(false);
        }
    };

    const handleSelectConversation = (conv: Conversation) => {
        setActiveConversation({
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
        });
        setActiveId(conv.id);
        onNavigate?.();
        router.push(`/conversation/${conv.id}`);
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        });
    };

    return (
        <Card className="p-0 border-none bg-transparent shadow-none text-foreground">
            {/* Minimal header removed to match mockup */}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#a0a0a0]" />
                </div>
            ) : visibleConversations.length === 0 ? (
                <div className="text-center py-8 text-[#a0a0a0]">
                    <p className="text-sm">
                        {isWorkspaceScopedView ? 'No workspace conversations.' : 'No conversations yet.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-0.5">
                    {visibleConversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={cn(
                                "group flex items-center justify-between px-3 py-2 rounded-full transition-colors cursor-pointer text-[13px]",
                                conv.id === activeId 
                                    ? "bg-[#2a2a2a] text-[#e3e3e3] font-medium" 
                                    : "bg-transparent text-[#c0c0c0] hover:bg-white/5"
                            )}
                            onClick={() => handleSelectConversation(conv)}
                        >
                            <p className="truncate mr-2 w-full">
                                {conv.title}
                            </p>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0 text-[#808080] hover:text-[#ff6b6b] hover:bg-transparent flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-[#1e1e1e] border-[#333] text-[#e3e3e3]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-[#a0a0a0]">
                                            This will permanently delete &quot;{conv.title}&quot;. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white border-none">Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => handleDelete(conv.id)}
                                            className="bg-[#d32f2f] hover:bg-[#b71c1c] text-white"
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}
