// lib/agents/core/approvalStore.ts
// Ephemeral in-memory store for human-in-the-loop tool approvals. A paused
// mutative tool (with requiresApproval) is registered here under an atomic
// approvalId so a follow-up "approve/deny" request can resume it.
import { randomUUID } from "crypto";
import { AgentContext, Tool } from "./types";

export interface PausedTool {
  approvalId: string;
  toolName: string;
  input: any;
  context: AgentContext;
  tool: Tool;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const pending = new Map<string, PausedTool>();

/** Register a paused tool and return its approvalId. */
export function registerPausedTool(
  toolName: string,
  input: any,
  context: AgentContext,
  tool: Tool
): string {
  const approvalId = randomUUID();
  pending.set(approvalId, {
    approvalId,
    toolName,
    input,
    context,
    tool,
    createdAt: Date.now(),
  });
  return approvalId;
}

/** Look up a paused tool (and remove it to prevent double-execution). */
export function takePausedTool(approvalId: string): PausedTool | null {
  const entry = pending.get(approvalId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    pending.delete(approvalId);
    return null;
  }
  pending.delete(approvalId);
  return entry;
}

/** Drop a paused tool without executing (denial, timeout, etc.). */
export function dropPausedTool(approvalId: string): void {
  pending.delete(approvalId);
}