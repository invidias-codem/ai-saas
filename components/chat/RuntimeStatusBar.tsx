"use client";

import { Activity, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type RuntimeState = "idle" | "thinking" | "executing_tools" | "streaming" | "error";

function modeLabel(mode?: string | null) {
  switch (mode) {
    case "research":
      return "Research Analyst";
    case "agentic":
      return "Agentic Operator";
    case "drafting":
      return "Drafting Partner";
    case "memory_native":
      return "Memory-Native Assistant";
    case "copilot":
      return "Fast Copilot";
    default:
      return "Custom Profile";
  }
}

function getRuntimeState({
  loading,
  streaming,
  streamingContent,
  error,
  agentMode,
}: {
  loading: boolean;
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  agentMode: string | undefined;
}): RuntimeState {
  if (error) return "error";
  if (streaming && streamingContent) return "streaming";
  if (loading && agentMode === "agentic") return "executing_tools";
  if (loading) return "thinking";
  return "idle";
}

function runtimeLabel(state: RuntimeState, agentMode?: string) {
  switch (state) {
    case "thinking":
      return "Thinking";
    case "executing_tools":
      return "Executing tools";
    case "streaming":
      return "Streaming response";
    case "error":
      return "Error";
    default:
      return agentMode ? modeLabel(agentMode) : "Ready";
  }
}

function runtimeColor(state: RuntimeState) {
  switch (state) {
    case "thinking":
      return "text-amber-600 dark:text-amber-400";
    case "executing_tools":
      return "text-violet-600 dark:text-violet-400";
    case "streaming":
      return "text-sky-600 dark:text-sky-400";
    case "error":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-emerald-600 dark:text-emerald-400";
  }
}

interface RuntimeStatusBarProps {
  agentMode: string | undefined;
  loading: boolean;
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  executionMode?: string;
  intent?: string;
  pendingApproval?: boolean;
}

/**
 * Runtime status badge: shows the live chat state (thinking/streaming/error),
 * plus debug execution mode + intent. Purely presentational.
 *
 * Extracted from conversation/[id]/client.tsx (T7). The `executionMode` and
 * `intent` fields are the "debug" data — produced by the stream pipeline and
 * passed in as props; this component owns no state.
 */
export function RuntimeStatusBar({
  agentMode,
  loading,
  streaming,
  streamingContent,
  error,
  executionMode,
  intent,
  pendingApproval,
}: RuntimeStatusBarProps) {
  const state = getRuntimeState({ loading, streaming, streamingContent, error, agentMode });
  const Icon = state === "executing_tools" ? Wrench : Activity;
  const label = runtimeLabel(state, agentMode);
  const color = runtimeColor(state);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all duration-300",
        color,
        state !== "idle" && "border-current/20 bg-current/5"
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {executionMode && state !== "idle" && (
        <span className="text-muted-foreground">· {executionMode}</span>
      )}
      {intent && state !== "idle" && (
        <span className="text-muted-foreground">· {intent}</span>
      )}
      {pendingApproval && (
        <span className="text-amber-600 dark:text-amber-400 animate-pulse">
          · Awaiting approval
        </span>
      )}
      {agentMode && state === "idle" && !pendingApproval && (
        <span className="text-muted-foreground">· {modeLabel(agentMode)}</span>
      )}
    </div>
  );
}