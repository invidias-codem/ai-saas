"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { Check, Copy, Terminal } from "lucide-react";

interface CodeBlockProps {
  children: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
}

export function CodeBlock({
  children,
  language = "text",
  filename,
  showLineNumbers = false,
  highlightLines = [],
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Custom style overrides
  const customStyle = {
    ...oneDark,
    'pre[class*="language-"]': {
      ...oneDark['pre[class*="language-"]'],
      background: "transparent",
      margin: 0,
      padding: "1rem",
      fontSize: "0.875rem",
      lineHeight: "1.7",
    },
    'code[class*="language-"]': {
      ...oneDark['code[class*="language-"]'],
      background: "transparent",
    },
  };

  return (
    <div className="my-6 rounded-xl overflow-hidden border border-white/10 bg-[var(--lattice-mineral-ink)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--lattice-mist-sage)]" />
          {filename ? (
            <span className="text-sm text-[var(--lattice-limestone)] font-mono">{filename}</span>
          ) : (
            <span className="text-sm text-[var(--lattice-mist-sage)] font-mono">{language}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors",
            copied
              ? "bg-white/15 text-[var(--lattice-limestone)]"
              : "bg-white/5 text-[var(--lattice-limestone)] hover:bg-white/10 hover:text-white"
          )}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={language}
          style={customStyle}
          showLineNumbers={showLineNumbers}
          wrapLines={highlightLines.length > 0}
          lineProps={(lineNumber) => {
            const style: React.CSSProperties = { display: "block" };
            if (highlightLines.includes(lineNumber)) {
              style.backgroundColor = "color-mix(in srgb, var(--lattice-action) 16%, transparent)";
              style.borderLeft = "3px solid var(--lattice-action)";
              style.marginLeft = "-3px";
              style.paddingLeft = "calc(1rem - 3px)";
            }
            return { style };
          }}
          customStyle={{
            margin: 0,
            background: "transparent",
          }}
        >
          {children.trim()}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// Inline code component
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-chrome text-primary text-sm font-mono">
      {children}
    </code>
  );
}
