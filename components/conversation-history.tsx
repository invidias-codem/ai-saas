"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { MessageSquare, Trash2, Plus, Loader2, Calendar, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    fetchConversations,
    deleteConversation,
    createNewConversation,
    setActiveConversation,
    getActiveConversationId,
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
    title: string;
    messageCount: number;
    createdAt: number;
    lastUpdated: number;
    isArchived: boolean;
    preview?: string;
}

export function ConversationHistory() {
    const router = useRouter();
    const pathname = usePathname();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        loadConversations();
        // Extract conversation ID from URL
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

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const success = await deleteConversation(id);
            if (success) {
                setConversations((prev) => prev.filter((c) => c.id !== id));
                // If we're deleting the active conversation, redirect to new conversation
                if (id === activeId) {
                    clearSessionMemoryStorage();
                    router.push('/conversation/new');
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
            // Navigate to the new conversation route which will create and redirect
            router.push('/conversation/new');
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
        // Navigate to the specific conversation URL
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
        <Card className="p-4 border-none bg-transparent shadow-none text-white">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-500" />
                    <h3 className="text-sm font-semibold text-gray-200">History</h3>
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
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
            ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No conversations yet.</p>
                </div>
            ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer hover:bg-white/10 border-white/5",
                                conv.id === activeId ? "bg-white/10 border-sky-500/30" : "bg-transparent"
                            )}
                            onClick={() => handleSelectConversation(conv)}
                        >
                            <div className="flex-shrink-0 mt-1">
                                <MessageCircle
                                    className={cn(
                                        "w-4 h-4",
                                        conv.id === activeId ? "text-sky-400" : "text-gray-400"
                                    )}
                                />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className={cn("text-sm font-medium truncate", conv.id === activeId ? "text-white" : "text-gray-300")}>
                                        {conv.title}
                                    </p>
                                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                        {formatDate(conv.lastUpdated)}
                                    </span>
                                </div>

                                {conv.preview && (
                                    <p className="text-xs text-gray-500 truncate mt-1">{conv.preview}</p>
                                )}
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-gray-500 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Trash2 className={cn("w-3 h-3", deletingId === conv.id && "opacity-50")} />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-gray-900 border-gray-800 text-white">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                            This will permanently delete "{conv.title}". This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700">Cancel</AlertDialogCancel>
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
