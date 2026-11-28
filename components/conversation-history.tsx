"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    fetchConversations,
    deleteConversation,
    setActiveConversation,
} from "@/lib/conversationManager";
import { clearSessionMemoryStorage } from "@/lib/sessionClientMemory";

export const CONVERSATIONS_INVALIDATE_EVENT = 'conversations:invalidate';

export function emitConversationsInvalidate() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CONVERSATIONS_INVALIDATE_EVENT));
}

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

interface ConversationHistoryProps {
    onNavigate?: () => void;
    initialConversations?: Conversation[];
}

function extractWorkspaceId(pathname: string | null): string | null {
    if (!pathname) return null;
    const match = pathname.match(/\/workspaces\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

export function ConversationHistory({ onNavigate, initialConversations }: ConversationHistoryProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations ?? []);
    const [loading, setLoading] = useState(!initialConversations);
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
        // Skip the mount fetch when the RSC shell already seeded the list.
        if (initialConversations) return;
        // Fetch on mount (or pathname change) — external data load.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadConversations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // Targeted invalidation: refetch when a conversation is created/deleted
    // elsewhere in the app (e.g. /conversation/new route handler, vault
    // restore). Cheap event bus; avoids re-fetching on every URL change.
    useEffect(() => {
        const handler = () => {
            loadConversations();
        };
        window.addEventListener(CONVERSATIONS_INVALIDATE_EVENT, handler);
        return () => window.removeEventListener(CONVERSATIONS_INVALIDATE_EVENT, handler);
    }, []);

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
                emitConversationsInvalidate();
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
                // Blank-slate guarantee: resolver bypasses last-open restore.
                router.push(`/workspaces/${activeWorkspaceId}/conversation?action=new`);
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
                    <Loader2 className="h-6 w-6 text-muted-foreground motion-safe:animate-spin" />
                </div>
            ) : visibleConversations.length === 0 ? (
                <div className="py-5 text-center text-muted-foreground">
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
                                "flex items-center gap-1 rounded-lg pr-1 text-[13px] transition-colors",
                                conv.id === activeId
                                    ? "bg-accent font-semibold text-accent-foreground ring-1 ring-inset ring-primary/25"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <button
                                type="button"
                                aria-current={conv.id === activeId ? "page" : undefined}
                                onClick={() => handleSelectConversation(conv)}
                                className="min-h-9 min-w-0 flex-1 truncate rounded-lg py-1.5 pl-3 text-left"
                            >
                                {conv.title}
                            </button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Delete conversation: ${conv.title}`}
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-danger-surface hover:text-destructive"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="w-[calc(100%-2rem)] break-words rounded-lg">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete &quot;{conv.title}&quot;. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => handleDelete(conv.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
