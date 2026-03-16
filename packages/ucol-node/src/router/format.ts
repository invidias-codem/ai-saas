/**
 * @file router/format.ts
 * @description FormatAdapter — shapes context slices for different model providers.
 *
 * Format map per spec §5.3 Step 7:
 *   anthropic/*  → XML_TAGGED
 *   google/*     → MARKDOWN_HEADERS
 *   deepseek/*   → JSON_STRUCTURED
 *   local/*      → PLAIN_TEXT
 */

import type {
  FormatAdapter,
  KnowledgeItem,
  Artifact,
  HistoryItem,
  ContextSliceItem,
  ModelID,
} from '../store/schema.js';

type ContextItem = KnowledgeItem | Artifact | HistoryItem;

/**
 * Determine the FormatAdapter for a given ModelID.
 *
 * @param modelId - ModelID string (provider/model[@version])
 * @returns FormatAdapter enum value
 */
export function resolveFormatAdapter(modelId: ModelID): FormatAdapter {
  if (modelId.startsWith('anthropic/')) return 'XML_TAGGED';
  if (modelId.startsWith('google/')) return 'MARKDOWN_HEADERS';
  if (modelId.startsWith('deepseek/')) return 'JSON_STRUCTURED';
  if (modelId.startsWith('local/')) return 'PLAIN_TEXT';
  // Fallback for unknown providers
  return 'PLAIN_TEXT';
}

/**
 * Apply format adaptation to a list of context items.
 *
 * @param items - Raw context items with scores
 * @param adapter - Target format adapter
 * @returns Array of ContextSliceItems with formatted content
 */
export function applyFormat(
  items: Array<{ item: ContextItem; score: number }>,
  adapter: FormatAdapter
): ContextSliceItem[] {
  return items.map(({ item, score }) => {
    const id = 'id' in item ? item.id : '';
    const itemType = resolveItemType(item);
    const formatted = formatItem(item, adapter);
    return {
      item_id: id,
      item_type: itemType,
      score,
      formatted,
    };
  });
}

/** Determine if an item is knowledge, artifact, or history */
function resolveItemType(item: ContextItem): 'knowledge' | 'artifact' | 'history' {
  if ('valid_from' in item) return 'knowledge';
  if ('session_id' in item) return 'history';
  return 'artifact';
}

/** Format a single context item for a given adapter */
function formatItem(item: ContextItem, adapter: FormatAdapter): string {
  switch (adapter) {
    case 'XML_TAGGED':
      return formatXML(item);
    case 'MARKDOWN_HEADERS':
      return formatMarkdown(item);
    case 'JSON_STRUCTURED':
      return formatJSON(item);
    case 'PLAIN_TEXT':
      return formatPlain(item);
  }
}

/**
 * Format for Anthropic/Claude — XML tagged context.
 *
 * Output shape:
 * ```xml
 * <context>
 *   <fact type="FACT" confidence="0.95" tier="INTERNAL">...</fact>
 * </context>
 * ```
 */
function formatXML(item: ContextItem): string {
  if ('valid_from' in item) {
    const k = item as KnowledgeItem;
    const tag = k.type.toLowerCase();
    const attrs = `type="${k.type}" confidence="${k.confidence.toFixed(2)}" tier="${k.security_tier}"`;
    const escaped = escapeXML(k.content);
    return `<${tag} ${attrs}>${escaped}</${tag}>`;
  }
  if ('session_id' in item) {
    const h = item as HistoryItem;
    return `<turn role="${h.role.toLowerCase()}">${escapeXML(h.content)}</turn>`;
  }
  const a = item as Artifact;
  return `<artifact type="${a.type}" mime="${a.mime_type}" version="${a.version}">${escapeXML(a.description ?? a.id)}</artifact>`;
}

/**
 * Format for Google/Gemini — Markdown headers.
 *
 * Output shape:
 * ```markdown
 * ### FACT (confidence: 0.95) [INTERNAL]
 * The database uses PostgreSQL 15...
 * ```
 */
function formatMarkdown(item: ContextItem): string {
  if ('valid_from' in item) {
    const k = item as KnowledgeItem;
    return `### ${k.type} (confidence: ${k.confidence.toFixed(2)}) [${k.security_tier}]\n${k.content}`;
  }
  if ('session_id' in item) {
    const h = item as HistoryItem;
    return `### ${h.role} turn\n${h.content}`;
  }
  const a = item as Artifact;
  return `### Artifact: ${a.type} [${a.version}]\n${a.description ?? a.id}`;
}

/**
 * Format for DeepSeek — JSON structured.
 */
function formatJSON(item: ContextItem): string {
  if ('valid_from' in item) {
    const k = item as KnowledgeItem;
    return JSON.stringify({
      type: 'knowledge',
      knowledge_type: k.type,
      content: k.content,
      confidence: k.confidence,
      security_tier: k.security_tier,
    });
  }
  if ('session_id' in item) {
    const h = item as HistoryItem;
    return JSON.stringify({
      type: 'history',
      role: h.role,
      content: h.content,
      sequence: h.sequence,
    });
  }
  const a = item as Artifact;
  return JSON.stringify({
    type: 'artifact',
    artifact_type: a.type,
    mime_type: a.mime_type,
    version: a.version,
    description: a.description,
  });
}

/**
 * Format for local models — plain text.
 */
function formatPlain(item: ContextItem): string {
  if ('valid_from' in item) {
    const k = item as KnowledgeItem;
    return `[${k.type}] ${k.content} (confidence: ${k.confidence.toFixed(2)})`;
  }
  if ('session_id' in item) {
    const h = item as HistoryItem;
    return `${h.role}: ${h.content}`;
  }
  const a = item as Artifact;
  return `Artifact ${a.type} v${a.version}: ${a.description ?? a.id}`;
}

/** Escape XML special characters */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate token count for a formatted context slice.
 * Approximation: 1 token ≈ 4 characters.
 *
 * @param sliceItems - Formatted context slice items
 * @returns Estimated token count
 */
export function estimateTokens(sliceItems: ContextSliceItem[]): number {
  const totalChars = sliceItems.reduce((acc, item) => acc + item.formatted.length, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Greedy pack: add items in score order until token budget is exhausted.
 *
 * @param items - Scored items sorted by score DESC
 * @param budgetTokens - Maximum token budget
 * @param adapter - Format adapter to use
 * @returns Packed context slice items
 */
export function greedyPack(
  items: Array<{ item: ContextItem; score: number }>,
  budgetTokens: number,
  adapter: FormatAdapter
): ContextSliceItem[] {
  const result: ContextSliceItem[] = [];
  let tokenCount = 0;

  for (const { item, score } of items) {
    const formatted = formatItem(item, adapter);
    const itemTokens = Math.ceil(formatted.length / 4);

    if (tokenCount + itemTokens > budgetTokens) continue;

    const id = 'id' in item ? item.id : '';
    const itemType = resolveItemType(item);

    result.push({ item_id: id, item_type: itemType, score, formatted });
    tokenCount += itemTokens;
  }

  return result;
}
