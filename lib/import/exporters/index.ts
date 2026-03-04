// lib/import/exporters/index.ts
// Export Genie conversations → portable format (GUIF / UDIF-draft / OpenAI format)
// This is the reverse of the import pipeline — critical for UCOL data sovereignty.

import {
  GenieUniversalImport,
  GenieExportOptions,
  GenieConversation,
  ImportedConversation,
  ImportedMessage,
  UDIFMetadata,
} from '@/lib/types/imports';

// ─── GUIF Export (Genie → GenieUniversalImport) ───────────────────────────────
// Native format — lossless round-trip. Recommended for UCOL context handoff.

export function exportToGUIF(
  conversations: GenieConversation[],
  options: GenieExportOptions = { format: 'guif' }
): GenieUniversalImport {
  const filtered = filterConversations(conversations, options);

  const udif: UDIFMetadata = {
    udifVersion: 'draft-2026',   // Update when UDIF 2.0 ships
    sovereigntyMode: 'user-owned',
    exportedForPortability: true,
  };

  return {
    version: '1.0',
    source: 'genie',
    exportedAt: new Date().toISOString(),
    conversations: filtered.map(toImportedConversation),
    udif,
  };
}

// ─── UDIF Draft Export ────────────────────────────────────────────────────────
// Forward-compatible export — maps to UDIF 2.0 expected structure.
// When the real UDIF spec ships, this is what we update.

export function exportToUDIFDraft(
  conversations: GenieConversation[],
  userId: string,
  options: GenieExportOptions = { format: 'udif-draft' }
): object {
  const filtered = filterConversations(conversations, options);

  return {
    schema: 'udif:draft-2026',
    exportedAt: new Date().toISOString(),
    owner: {
      id: userId,
      sovereigntyMode: 'user-owned',
      platform: 'genie',
    },
    contextUnits: filtered.map(conv => ({
      id: conv.id,
      type: 'conversation',
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      sourcePlatform: conv.sourcePlatform || 'genie',
      externalId: conv.externalId,
      turns: conv.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
        model: msg.model,
        // UCOL routing metadata — which node generated this turn
        ucolNode: msg.model ? inferUCOLNode(msg.model) : 'unknown',
      })),
    })),
    ucolMetadata: {
      version: '1.0',
      exportedBy: 'genie-ucol-bridge',
      routingHint: 'deep', // Default: this is rich conversation context
    },
  };
}

// ─── OpenAI-Compatible Export ─────────────────────────────────────────────────
// Export Genie conversations in OpenAI's conversations.json format.
// Allows Genie users to "port out" to ChatGPT if desired (true data sovereignty).

export function exportToOpenAIFormat(conversations: GenieConversation[]): object[] {
  return conversations.map(conv => {
    // Build OpenAI tree structure (linear chain: each msg points to parent)
    const mapping: Record<string, any> = {};
    let previousId: string | null = null;

    const nodeIds = conv.messages.map((_, i) => `node-${conv.id}-${i}`);
    const rootId = `root-${conv.id}`;

    // Root node
    mapping[rootId] = { id: rootId, message: null, parent: null, children: nodeIds[0] ? [nodeIds[0]] : [] };

    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i];
      const nodeId = nodeIds[i];
      const nextId = nodeIds[i + 1] || null;

      mapping[nodeId] = {
        id: nodeId,
        message: {
          id: `msg-${conv.id}-${i}`,
          author: { role: msg.role === 'assistant' ? 'assistant' : 'user' },
          content: { content_type: 'text', parts: [msg.content] },
          create_time: Math.floor(new Date(msg.createdAt).getTime() / 1000),
          metadata: { model_slug: msg.model || 'unknown' },
        },
        parent: i === 0 ? rootId : nodeIds[i - 1],
        children: nextId ? [nextId] : [],
      };
    }

    return {
      id: conv.id,
      title: conv.title,
      create_time: Math.floor(new Date(conv.createdAt).getTime() / 1000),
      update_time: Math.floor(new Date(conv.updatedAt).getTime() / 1000),
      current_node: nodeIds[nodeIds.length - 1] || rootId,
      mapping,
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterConversations(
  conversations: GenieConversation[],
  options: GenieExportOptions
): GenieConversation[] {
  let result = [...conversations];

  if (options.conversationIds?.length) {
    result = result.filter(c => options.conversationIds!.includes(c.id));
  }

  if (options.dateRange) {
    const from = new Date(options.dateRange.from).getTime();
    const to = new Date(options.dateRange.to).getTime();
    result = result.filter(c => {
      const t = new Date(c.createdAt).getTime();
      return t >= from && t <= to;
    });
  }

  return result;
}

function toImportedConversation(conv: GenieConversation): ImportedConversation {
  return {
    externalId: conv.externalId || conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    messages: conv.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.createdAt,
      model: msg.model,
    } as ImportedMessage)),
  };
}

function inferUCOLNode(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('gemini')) return 'gemini-node';
  if (m.includes('claude') || m.includes('anthropic')) return 'claude-node';
  if (m.includes('gpt') || m.includes('openai')) return 'openai-node';
  if (m.includes('deepseek')) return 'deepseek-node';
  return 'unknown-node';
}
