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

export function ConversationHistory() {
    const router = useRouter();
    const pathname = usePathname();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);

    const activeWorkspaceId = useMemo(() => extractWorkspaceId(pathname), [pathname]);
    const isWorkspaceScopedView = Boolean(activeWorkspaceId);

    useEffect(() => {
        loadConversations();
        const match = pathname?.match(/\/conversation\/([^/]+)/);
        setActiveId(match ? match[1] : null);
    }, [pathname]);

    const loadConversations = async () => {
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
    };

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
        <Card className="p-4 border-none bg-transparent shadow-none text-foreground">
            <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-sky-500" />
                        <h3 className="text-sm font-semibold text-foreground/80">
                            {isWorkspaceScopedView ? 'Workspace History' : 'History'}
                        </h3>
                    </div>
                    {isWorkspaceScopedView && (
                        <div className="inline-flex items-center gap-1 text-[10px] text-sky-300/80">
                            <Layers3 className="w-3 h-3" />
                            Showing chats for this workspace
                        </div>
                    )}
                </div>
                <Button
                    onClick={handleNewConversation}
                    disabled={creatingNew}
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700 text-white"
                >
                    {creatingNew ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating...
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4 mr-2" />
                            New Chat
                        </>
                    )}
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : visibleConversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">
                        {isWorkspaceScopedView ? 'No workspace conversations yet.' : 'No conversations yet.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {visibleConversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer hover:bg-foreground/5 border-border/30",
                                conv.id === activeId ? "bg-foreground/5 border-sky-500/30" : "bg-transparent"
                            )}
                            onClick={() => handleSelectConversation(conv)}
                        >
                            <div className="flex-shrink-0 mt-1">
                                <MessageCircle
                                    className={cn(
                                        "w-4 h-4",
                                        conv.id === activeId ? "text-sky-400" : "text-muted-foreground"
                                    )}
                                />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className={cn("text-sm font-medium truncate", conv.id === activeId ? "text-foreground" : "text-foreground/80")}>
                                        {conv.title}
                                    </p>
                                    <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                                        {formatDate(conv.lastUpdated)}
                                    </span>
                                </div>

                                {conv.preview && (
                                    <p className="text-xs text-muted-foreground/60 truncate mt-1">{conv.preview}</p>
                                )}
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Trash2 className={cn("w-3 h-3", deletingId === conv.id && "opacity-50")} />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-card border-border text-foreground">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-muted-foreground">
                                            This will permanently delete &quot;{conv.title}&quot;. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-secondary hover:bg-secondary/80 text-foreground border-border">Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => handleDelete(conv.id)}
                                            className="bg-red-600 hover:bg-red-700"
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
