import React from "react"
import { ScrollArea } from "@/components/ui/scroll-area" // Assuming this exists or using standard div
import { GenieUniversalImport } from "@/lib/types/imports"
import { MessageSquare, Calendar, User, FileText } from "lucide-react"

interface ImportPreviewProps {
    data: GenieUniversalImport
}

export function ImportPreview({ data }: ImportPreviewProps) {
    const totalConversations = data.conversations.length
    const previewConversations = data.conversations.slice(0, 5) // Show first 5

    return (
        <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="bg-muted/50 p-3 border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Content Preview
                </h3>
                <span className="text-xs text-muted-foreground">
                    Showing 5 of {totalConversations} conversations
                </span>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-0">
                {previewConversations.map((conv, i) => (
                    <div key={i} className="p-4 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium text-sm text-foreground truncate max-w-[70%]">
                                {conv.title || "Untitled Conversation"}
                            </h4>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(conv.createdAt).toLocaleDateString()}
                            </span>
                        </div>

                        <div className="space-y-2">
                            {conv.messages.slice(0, 2).map((msg, j) => (
                                <div key={j} className="flex gap-3 text-xs">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                                        }`}>
                                        {msg.role === 'user' ? <User className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                                    </div>
                                    <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                                        {msg.content}
                                    </p>
                                </div>
                            ))}
                            {conv.messages.length > 2 && (
                                <p className="text-[10px] text-muted-foreground pl-9 italic">
                                    + {conv.messages.length - 2} more messages...
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {totalConversations > 5 && (
                <div className="p-2 text-center bg-muted/30 border-t border-border/50 text-xs text-muted-foreground">
                    and {totalConversations - 5} more...
                </div>
            )}
        </div>
    )
}
