"use client";

import { cn } from "@/lib/utils";

export type Artifact = {
  kind: "code" | "ui" | "diagram";
  title?: string;
  content: string;
  language?: string;
};

interface ArtifactCardProps {
  artifact: Artifact;
}

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  const isCode = artifact.kind === "code";
  const isUi = artifact.kind === "ui";
  const isDiagram = artifact.kind === "diagram";

  return (
    <div
      className={cn(
        "my-4 overflow-hidden rounded-xl border",
        "bg-white text-slate-900 dark:bg-zinc-950 dark:text-zinc-100",
        "shadow-md"
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {artifact.title || artifact.kind}
        </span>
        {isCode && artifact.language ? (
          <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            {artifact.language}
          </span>
        ) : null}
      </div>

      {isUi ? (
        <div className="p-4">
          <div
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black"
            dangerouslySetInnerHTML={{ __html: artifact.content }}
          />
        </div>
      ) : isDiagram ? (
        <div className="p-4">
          <pre className="text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-200">
            {artifact.content}
          </pre>
        </div>
      ) : (
        <pre className="p-4 overflow-x-auto text-xs text-zinc-50 font-mono leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700">
          {artifact.content}
        </pre>
      )}
    </div>
  );
}
