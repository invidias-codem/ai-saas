/**
 * embedding.ts — Unified Embedding Provider
 *
 * Primary:  Lambda Labs Ollama (nomic-embed-text, 768-dim) — zero API cost, self-hosted
 * Fallback: Gemini gemini-embedding-001 (768-dim) — if GOOGLE_API_KEY is set
 * Safety:   Zero vector (768-dim) — graceful degradation, never throws to callers
 *
 * All vectors are 768-dimensional — matches memory_bank, procedural_memory,
 * graph_nodes (after 20260323 migration), and match_memories RPC.
 *
 * Migration from GCP: T-038 (2026-03-23)
 *   - Removed hard dependency on Google AI SDK for embeddings
 *   - Ollama /api/embeddings endpoint matches the generate API pattern already
 *     used by BlueskyResponder and HermesProvider
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const EMBEDDING_DIM = 768;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 100;
const OLLAMA_TIMEOUT_MS = 10_000; // 10s — Lambda Labs should respond well within this

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
    embedding: number[];
    timestamp: number;
}

const embeddingCache = new Map<string, CacheEntry>();

function getCached(key: string): number[] | null {
    const entry = embeddingCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        embeddingCache.delete(key);
        return null;
    }
    return entry.embedding;
}

function setCache(key: string, embedding: number[]): void {
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
        const oldest = embeddingCache.keys().next().value;
        if (oldest) embeddingCache.delete(oldest);
    }
    embeddingCache.set(key, { embedding, timestamp: Date.now() });
}

// ── Providers ─────────────────────────────────────────────────────────────────

/**
 * Lambda Labs Ollama — primary provider.
 * Uses the /api/embeddings endpoint (Ollama-native, not OpenAI-compat).
 * Model: nomic-embed-text (768-dim, fast, good semantic quality).
 */
async function embedWithOllama(text: string): Promise<number[]> {
    const baseUrl = process.env.LAMBDA_OLLAMA_URL;
    if (!baseUrl) throw new Error('[Embedding] LAMBDA_OLLAMA_URL not set');

    const model = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    const url = `${baseUrl.replace(/\/$/, '')}/api/embeddings`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: text }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`[Embedding] Ollama HTTP ${res.status}: ${body}`);
        }

        const json = await res.json();

        if (!Array.isArray(json.embedding) || json.embedding.length === 0) {
            throw new Error('[Embedding] Ollama returned empty embedding');
        }

        return json.embedding as number[];
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Gemini fallback — only used if GOOGLE_API_KEY is present.
 * gemini-embedding-001 outputs 768-dim vectors.
 */
async function embedWithGemini(text: string): Promise<number[]> {
    if (!process.env.GOOGLE_API_KEY) {
        throw new Error('[Embedding] GOOGLE_API_KEY not set');
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent(text);

    const values = result.embedding?.values ?? [];
    if (values.length === 0) throw new Error('[Embedding] Gemini returned empty embedding');
    return values;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * generateEmbedding — generate a 768-dim vector for the given text.
 *
 * Provider order:
 *   1. Lambda Labs Ollama (nomic-embed-text) — if LAMBDA_OLLAMA_URL is set
 *   2. Gemini gemini-embedding-001           — if GOOGLE_API_KEY is set
 *   3. Zero vector                           — silent fallback, never throws
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = text.substring(0, 500);

    const cached = getCached(cacheKey);
    if (cached) {
        console.log('[Embedding] Cache hit');
        return cached;
    }

    // 1. Try Lambda Labs Ollama
    if (process.env.LAMBDA_OLLAMA_URL) {
        try {
            const embedding = await embedWithOllama(text);
            setCache(cacheKey, embedding);
            console.log(`[Embedding] Ollama OK — dim=${embedding.length}`);
            return embedding;
        } catch (err) {
            console.warn('[Embedding] Ollama failed, trying fallback:', err);
        }
    }

    // 2. Try Gemini
    if (process.env.GOOGLE_API_KEY) {
        try {
            const embedding = await embedWithGemini(text);
            // Handle rate limits
            setCache(cacheKey, embedding);
            console.log(`[Embedding] Gemini OK — dim=${embedding.length}`);
            return embedding;
        } catch (err: any) {
            if (err?.status === 429 || String(err).includes('429')) {
                console.warn('[Embedding] Gemini rate limited');
            } else {
                console.warn('[Embedding] Gemini failed:', err);
            }
        }
    }

    // 3. Zero vector — graceful degradation
    console.warn('[Embedding] All providers failed — returning zero vector');
    return new Array(EMBEDDING_DIM).fill(0);
}

/**
 * getEmbeddingDimension — returns the expected vector dimension.
 * Useful for Supabase RPC calls that need the query_embedding size.
 */
export function getEmbeddingDimension(): number {
    return EMBEDDING_DIM;
}

/**
 * clearEmbeddingCache — useful for testing or manual reset.
 */
export function clearEmbeddingCache(): void {
    embeddingCache.clear();
}
