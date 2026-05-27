"use strict";
/**
 * lib/ucol/ollamaKnowledgeContext.ts
 *
 * UCOL Knowledge Graph Bridge for Ollama/Hermes node.
 *
 * Fetches relevant context from Tech Genie's Supabase knowledge graph
 * and vector store, then injects it into Ollama prompts — grounding
 * the local model in the same memory that Gemini and Claude use.
 *
 * Usage:
 *   const ctx = await buildOllamaKnowledgeContext(userId, query);
 *   // Prepend ctx to system instruction for Hermes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOllamaKnowledgeContext = buildOllamaKnowledgeContext;
const supabase_js_1 = require("@supabase/supabase-js");
const embedding_1 = require("@/lib/memory/embedding");
const logger_1 = require("@/lib/logger");
const getSupabase = () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
    }
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
};
const MAX_FACTS = 8;
const MAX_GRAPH_NODES = 5;
const SIMILARITY_THRESHOLD = 0.72;
/**
 * Build a knowledge context string for the Ollama/Hermes node.
 * Pulls top-k facts from vector store + relevant graph nodes for the query.
 */
async function buildOllamaKnowledgeContext(userId, query) {
    const fragments = [];
    let factsUsed = 0;
    let graphNodesUsed = 0;
    try {
        // 1. Vector store: semantic fact retrieval
        const embedding = await (0, embedding_1.generateEmbedding)(query);
        const supabase = getSupabase();
        if (!supabase)
            return { systemFragment: '', factsUsed: 0, graphNodesUsed: 0 };
        const { data: vectorFacts, error: vecErr } = await supabase.rpc('match_memory_embeddings', {
            query_embedding: embedding,
            match_threshold: SIMILARITY_THRESHOLD,
            match_count: MAX_FACTS,
            filter_user_id: userId,
        });
        if (!vecErr && vectorFacts?.length) {
            const factLines = vectorFacts
                .map((f) => `- ${f.content} (confidence: ${Math.round(f.similarity * 100)}%)`)
                .join('\n');
            fragments.push(`## Retrieved Memory Facts\n${factLines}`);
            factsUsed = vectorFacts.length;
        }
    }
    catch (err) {
        logger_1.logger.warn('[OllamaKnowledgeCtx] Vector retrieval failed', err);
    }
    try {
        // 2. Knowledge graph: fetch high-confidence nodes related to query keywords
        const keywords = extractKeywords(query);
        if (keywords.length > 0) {
            const supabase = getSupabase();
            if (!supabase)
                return { systemFragment: '', factsUsed: 0, graphNodesUsed: 0 };
            const { data: graphNodes, error: graphErr } = await supabase
                .from('graph_nodes')
                .select('label, description, confidence, node_type')
                .eq('user_id', userId)
                .gte('confidence', 0.7)
                .or(keywords.map((k) => `label.ilike.%${k}%`).join(','))
                .order('confidence', { ascending: false })
                .limit(MAX_GRAPH_NODES);
            if (!graphErr && graphNodes?.length) {
                const nodeLines = graphNodes
                    .map((n) => `- [${n.node_type}] ${n.label}: ${n.description ?? 'no description'}`)
                    .join('\n');
                fragments.push(`## Knowledge Graph Context\n${nodeLines}`);
                graphNodesUsed = graphNodes.length;
            }
        }
    }
    catch (err) {
        logger_1.logger.warn('[OllamaKnowledgeCtx] Graph retrieval failed', err);
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
function extractKeywords(query) {
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
