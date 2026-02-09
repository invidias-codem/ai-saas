
import React from 'react';
import { BookOpen, Database, FileText, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Source {
    id: string;
    title: string;
    type: string;
    similarity?: number;
    content?: string;
}

interface SourceDisplayProps {
    sources: Source[];
    className?: string;
}

export function SourceDisplay({ sources, className }: SourceDisplayProps) {
    if (!sources || sources.length === 0) return null;

    const getIcon = (type: string) => {
        switch (type) {
            case 'fact': return <Lightbulb className="w-3 h-3 text-yellow-500" />;
            case 'memory': return <Database className="w-3 h-3 text-indigo-500" />;
            case 'file': return <FileText className="w-3 h-3 text-blue-500" />;
            default: return <BookOpen className="w-3 h-3 text-gray-500" />;
        }
    };

    return (
        <div className={cn("mt-3 pt-3 border-t border-border/40", className)}>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <BookOpen className="w-3 h-3" />
                <span>Sources</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {sources.map((source, idx) => (
                    <TooltipProvider key={idx}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted border border-transparent hover:border-border/50 transition-colors cursor-help text-xs max-w-[200px]">
                                    {getIcon(source.type)}
                                    <span className="truncate">{source.title}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                                <p className="font-semibold mb-1">{source.title}</p>
                                {source.content && (
                                    <p className="text-muted-foreground line-clamp-4">{source.content}</p>
                                )}
                                <div className="mt-1 text-xs opacity-50 capitalize">{source.type} • {Math.round((source.similarity || 0) * 100)}% Match</div>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ))}
            </div>
        </div>
    );
}
