"use client";

import { useState, useEffect } from "react";
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
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [creatingNew, setCreatingNew] = useState(false);
    const [activeId, setActiveId] = useState<string>("");

    useEffect(() => {
        loadConversations();
        setActiveId(getActiveConversationId());
    }, []);

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
                // If we're deleting the active conversation, clear local storage too
                if (id === activeId) {
                    clearSessionMemoryStorage();
                    setActiveId("merged");
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
            const newConv = await createNewConversation();
            if (newConv) {
                clearSessionMemoryStorage();
                setActiveId(newConv.id);
                loadConversations();
                // Redirect to conversation page
                window.location.href = "/conversation";
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
        // Redirect to conversation page
        window.location.href = "/conversation";
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
        <Card className="p-6 border-black/5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-sky-600" />
                    <h3 className="text-lg font-semibold">Conversation History</h3>
                </div>
                <Button
                    onClick={handleNewConversation}
                    disabled={creatingNew}
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700"
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
                    <p className="text-xs text-gray-400 mt-1">
                        Start chatting with Genie to see your history here.
                    </p>
                </div>
            ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer hover:bg-gray-50",
                                conv.id === activeId && "border-sky-200 bg-sky-50"
                            )}
                            onClick={() => handleSelectConversation(conv)}
                        >
                            <div className="flex-shrink-0 mt-1">
                                <MessageCircle
                                    className={cn(
                                        "w-4 h-4",
                                        conv.id === activeId ? "text-sky-600" : "text-gray-400"
                                    )}
                                />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {conv.title}
                                    </p>
                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                        {formatDate(conv.lastUpdated)}
                                    </span>
                                </div>

                                {conv.preview && (
                                    <p className="text-xs text-gray-500 truncate mt-1">{conv.preview}</p>
                                )}

                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" />
                                        {conv.messageCount} messages
                                    </span>
                                    {conv.id === activeId && (
                                        <span className="text-xs text-sky-600 font-medium">Active</span>
                                    )}
                                </div>
                            </div>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Trash2 className={cn("w-4 h-4", deletingId === conv.id && "opacity-50")} />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will permanently delete &quot;{conv.title}&quot; and all its messages. This action cannot be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
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
