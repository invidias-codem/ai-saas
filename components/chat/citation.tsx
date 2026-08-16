"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, ChevronDown, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CitationProps {
  number: number;
  title: string;
  content: string;
  originUri?: string;
  similarity?: number;
  lineage?: {
    relationship: string;
    content: string;
    confidence: number;
  }[];
}

/**
 * Inline citation component that renders [1] markers in Weaver's responses
 * as clickable elements that expand to show source content and causal lineage.
 */
export function Citation({ number, title, content, originUri, similarity, lineage }: CitationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <span className="inline-flex flex-col">
      {/* Inline citation marker */}
      <button
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold transition-colors",
          "bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20",
          isExpanded && "bg-purple-500/20"
        )}
        aria-expanded={isExpanded}
        aria-label={`Citation ${number}: ${title}`}
      >
        [{number}]
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Expandable drawer */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 mt-1 w-full max-w-lg"
          >
            <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                      Source [{number}]
                    </span>
                    {typeof similarity === "number" && (
                      <span className="text-[10px] text-muted-foreground">
                        {(similarity * 100).toFixed(1)}% match
                      </span>
                    )}
                  </div>
                  {originUri && (
                    <a
                      href={originUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Visit source
                    </a>
                  )}
                </div>
                <h4 className="text-sm font-medium text-foreground mt-1 truncate">
                  {title}
                </h4>
              </div>

              {/* Content */}
              <div className="px-4 py-3 max-h-48 overflow-y-auto">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {content}
                </p>
              </div>

              {/* Lineage (causal edges) */}
              {lineage && lineage.length > 0 && (
                <div className="px-4 py-3 border-t border-border bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Causal Lineage
                    </span>
                  </div>
                  <div className="space-y-2">
                    {lineage.map((edge, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-purple-500" />
                        <div>
                          <span className="font-medium text-purple-600 dark:text-purple-400">
                            {edge.relationship}
                          </span>
                          <span className="mx-1">—</span>
                          <span>{edge.content}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            ({(edge.confidence * 100).toFixed(0)}% conf.)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Parses markdown text and replaces [N] citation markers with Citation components.
 * Returns an array of React nodes for rendering.
 */
export function parseCitations(
  text: string,
  sources: Omit<CitationProps, "number">[]
): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    const sourceIndex = citationNumber - 1;

    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the citation component
    const source = sources[sourceIndex];
    if (source) {
      parts.push(
        <Citation
          key={`citation-${citationNumber}`}
          number={citationNumber}
          title={source.title}
          content={source.content}
          originUri={source.originUri}
          similarity={source.similarity}
          lineage={source.lineage}
        />
      );
    } else {
      // Fallback: render as plain text if source not found
      parts.push(`[${citationNumber}]`);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
