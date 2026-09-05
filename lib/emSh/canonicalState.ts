// lib/emSh/canonicalState.ts
// Wire <-> canonical state codec.
//
// The fallback router translates provider wire messages into the abstract
// Canonical State before re-mapping them onto the fallback provider's own
// wire format. This decouples failover from any single provider.

import type { ChatMessage } from '@/lib/llm/types';
import type { CanonicalStateNode, CanonicalRole } from './types';

// Map internal wire roles -> canonical abstract roles.
const WIRE_TO_CANONICAL: Record<string, CanonicalRole> = {
  system: 'SYSTEM',
  user: 'USER',
  assistant: 'AGENT',
  model: 'AGENT',
  bot: 'AGENT',
};

/**
 * Convert a provider wire message into a canonical node.
 * Returns null for roles that have no canonical equivalent (callers decide
 * whether to drop or coerce).
 */
export function toCanonicalNode(msg: ChatMessage, extra?: Partial<CanonicalStateNode>): CanonicalStateNode | null {
  const role = WIRE_TO_CANONICAL[msg.role];
  if (!role) return null;
  return {
    role,
    content: msg.text,
    ...(extra ?? {}),
  };
}

/** Convert a run of wire messages into canonical nodes (dropping unknowns). */
export function toCanonicalState(messages: ChatMessage[]): CanonicalStateNode[] {
  const out: CanonicalStateNode[] = [];
  for (const m of messages) {
    const node = toCanonicalNode(m);
    if (node) out.push(node);
  }
  return out;
}

// Map canonical roles back to the provider-agnostic wire role used by LLMProvider.
const CANONICAL_TO_WIRE: Record<CanonicalRole, ChatMessage['role']> = {
  SYSTEM: 'system',
  USER: 'user',
  AGENT: 'assistant',
  TOOL_INVOCATION: 'system',
  TOOL_RESULT: 'system',
};

/**
 * Convert canonical nodes into wire messages accepted by any LLMProvider.
 * TOOL_INVOCATION / TOOL_RESULT are folded into `system` messages (their
 * structured content flows through `content`), since the text-only providers
 * (DeepSeek/Kimi on NIM) have no distinct tool role.
 */
export function toProviderMessages(nodes: CanonicalStateNode[]): ChatMessage[] {
  return nodes.map((n) => ({
    role: CANONICAL_TO_WIRE[n.role],
    text: n.content,
  }));
}