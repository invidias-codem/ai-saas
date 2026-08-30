/**
 * lib/ucol/knowledgeContext.ts
 *
 * UCOL Knowledge Context Bridge — event-sourced memory grounding.
 *
 * Fetches relevant context from the Lattice knowledge substrate and injects
 * it into the generation prompt. Reads the event-sourced projections
 * (wm_nodes_view / match_memory_embeddings), NOT the legacy graph tables.
 *
 * Usage:
 *   const ctx = await buildKnowledgeContext(userId, query);
 *   // Prepend ctx.systemFragment to the system instruction.
 */

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/memory/embedding';
import { logger } from '@/lib/logger';

const getSupabase = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

const MAX_FACTS = 8;
const MAX_GRAPH_NODES = 5;
const SIMILARITY_THRESHOLD = 0.72;

export interface KnowledgeContext {
  systemFragment: string;  // ready to prepend to system instruction
  factsUsed: number;
  graphNodesUsed: number;
}

/**
 * Build a memory-grounding context string.
 * Pulls top-k facts from the vector store + relevant active graph nodes for the query.
 */
export async function buildKnowledgeContext(
  userId: string,
  query: string
): Promise<KnowledgeContext> {
  const fragments: string[] = [];
  let factsUsed = 0;
  let graphNodesUsed = 0;

  try {
    // 1. Vector store: semantic fact retrieval
    const embedding = await generateEmbedding(query);

    const supabase = getSupabase();
    if (!supabase) return { systemFragment: '', factsUsed: 0, graphNodesUsed: 0 };
    const { data: vectorFacts, error: vecErr } = await supabase.rpc(
      'match_memory_embeddings',
      {
        query_embedding: embedding,
        match_threshold: SIMILARITY_THRESHOLD,
        match_count: MAX_FACTS,
        filter_user_id: userId,
      }
    );

    if (!vecErr && vectorFacts?.length) {
      const factLines = vectorFacts
        .map((f: { content: string; similarity: number }) =>
          `- ${f.content} (confidence: ${Math.round(f.similarity * 100)}%)`
        )
        .join('\n');
      fragments.push(`## Retrieved Memory Facts\n${factLines}`);
      factsUsed = vectorFacts.length;
    }
  } catch (err) {
    logger.warn('[KnowledgeContext] Vector retrieval failed', err);
  }

  try {
    // 2. Event-sourced graph: fetch active nodes related to query keywords.
    //    wm_nodes_view projects only non-OBSOLETED entities; filter active
    //    (no expiry) entities matching the query keywords.
    const keywords = extractKeywords(query);
    if (keywords.length > 0) {
      const supabase = getSupabase();
      if (!supabase) return { systemFragment: '', factsUsed: 0, graphNodesUsed: 0 };
      const { data: graphNodes, error: graphErr } = await supabase
        .from('wm_nodes_view')
        .select('name, type, description, trust_tier')
        .eq('user_id', userId)
        .or(keywords.map((k) => `name.ilike.%${k}%`).join(','))
        .limit(MAX_GRAPH_NODES);

      if (!graphErr && graphNodes?.length) {
        const nodeLines = graphNodes
          .map(
            (n: { name: string; type: string; description: string | null; trust_tier: string }) =>
              `- [${n.type ?? 'entity'}] ${n.name}: ${n.description ?? 'no description'} (${n.trust_tier ?? 'UNVERIFIED'})`
          )
          .join('\n');
        fragments.push(`## Knowledge Graph Context\n${nodeLines}`);
        graphNodesUsed = graphNodes.length;
      }
    }
  } catch (err) {
    logger.warn('[KnowledgeContext] Graph retrieval failed', err);
  }

  if (fragments.length === 0) {
    return { systemFragment: '', factsUsed: 0, graphNodesUsed: 0 };
  }

  const systemFragment = [
    '## Tech Genie Knowledge Context',
    'The following facts and knowledge graph entries are retrieved from the user\'s memory.',
    'Use them to ground your response. Do not contradict confirmed facts.',
    '',
    ...fragments,
    '',
  ].join('\n');

  return { systemFragment, factsUsed, graphNodesUsed };
}

/** Simple keyword extractor — splits on spaces, filters stopwords, returns top-5 */
function extractKeywords(query: string): string[] {
  const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'what', 'how', 'why',
    'when', 'where', 'who', 'which', 'can', 'do', 'does', 'did',
    'will', 'would', 'should', 'could', 'have', 'has', 'had', 'be',
    'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with',
    'about', 'by', 'from', 'up', 'if', 'or', 'and', 'but', 'not',
    'that', 'this', 'it', 'my', 'your', 'our', 'their', 'its',
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, 5);
}