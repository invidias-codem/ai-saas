/**
 * embedding.ts — Gemini Embedding Provider
 *
 * Single provider: Gemini (gemini-embedding-2-preview, 3072-dim).
 *
 * The self-hosted Vast.ai / Ollama path (LAMBDA_OLLAMA_URL / LAMBDA_EMBED_URL)
 * has been removed. Embeddings route directly and exclusively to Gemini; the
 * only defensive layer left is exponential backoff for 429s and a degraded
 * zero-vector fallback (keyword/BM25) when Gemini itself is unresolvable.
 */

const EMBEDDING_DIM = 3072;
const L1_CACHE_TTL_MS = 1000 * 60 * 60;
const L2_CACHE_TTL_SEC = 60 * 60 * 24;
const MAX_L1_CACHE_SIZE = 100;
const EMBED_RETRY_MAX_ATTEMPTS = 4;
const EMBED_RETRY_BASE_MS = 500;
const EMBED_RETRY_MAX_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const status = err?.status;
  const message = String(err?.message || err);
  return status === 429 || status === '429' || message.includes('429') || /rate ?limit/i.test(message);
}

async function withExponentialBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let lastError: any;
  while (attempt < EMBED_RETRY_MAX_ATTEMPTS) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRateLimitError(err)) {
        throw err;
      }
      attempt++;
      if (attempt >= EMBED_RETRY_MAX_ATTEMPTS) {
        break;
      }
      const jitter = Math.floor(Math.random() * 250);
      const delay = Math.min(EMBED_RETRY_BASE_MS * 2 ** (attempt - 1) + jitter, EMBED_RETRY_MAX_MS);
      console.warn(`[Embedding] Rate limited on attempt ${attempt}/${EMBED_RETRY_MAX_ATTEMPTS}, backing off ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

const REDIS_KEY_PREFIX = 'embed:v2:';

export type EmbeddingDimension = 768 | 3072;
export type EmbeddingProvider = 'gemini' | 'zero_vector';

export type EmbeddingResult = {
  vector: number[];
  dimension: EmbeddingDimension;
  provider: EmbeddingProvider;
  model: string;
  /** True when Gemini failed and this is a lexical-fallback placeholder.
   *  Callers should degrade to keyword/BM25 search rather than treating the
   *  zero vector as a real embedding. */
  degraded?: boolean;
};

interface CacheEntry {
  result: EmbeddingResult;
  timestamp: number;
}

const embeddingCache = new Map<string, CacheEntry>();

function getL1Cached(key: string): EmbeddingResult | null {
  const entry = embeddingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > L1_CACHE_TTL_MS) {
    embeddingCache.delete(key);
    return null;
  }
  return entry.result;
}

function setL1Cache(key: string, result: EmbeddingResult): void {
  if (embeddingCache.size >= MAX_L1_CACHE_SIZE) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, { result, timestamp: Date.now() });
}

function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = require('@upstash/redis');
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function getL2Cached(key: string): Promise<EmbeddingResult | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const value = await redis.get(`${REDIS_KEY_PREFIX}${key}`);
    if (!value) return null;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (
      parsed &&
      Array.isArray(parsed.vector) &&
      parsed.dimension === EMBEDDING_DIM &&
      parsed.vector.length === EMBEDDING_DIM
    ) {
      return parsed as EmbeddingResult;
    }
    return null;
  } catch (err) {
    console.warn('[Embedding] Redis L2 get failed (non-fatal):', err);
    return null;
  }
}

async function setL2Cache(key: string, result: EmbeddingResult): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(`${REDIS_KEY_PREFIX}${key}`, JSON.stringify(result), { ex: L2_CACHE_TTL_SEC });
  } catch (err) {
    console.warn('[Embedding] Redis L2 set failed (non-fatal):', err);
  }
}

function buildEmbeddingResult(vector: number[], provider: EmbeddingProvider, model: string): EmbeddingResult {
  const dimension = vector.length;
  if (dimension !== EMBEDDING_DIM) {
    throw new Error(`[Embedding] Unsupported embedding dimension: ${dimension} (expected ${EMBEDDING_DIM})`);
  }
  return { vector, dimension, provider, model };
}

async function embedWithGemini(text: string): Promise<EmbeddingResult> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('[Embedding] GOOGLE_API_KEY not set');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const modelName = 'gemini-embedding-2-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await withExponentialBackoff(async () => {
    const result = await model.embedContent(text);
    const values = result.embedding?.values ?? [];
    if (values.length === 0) throw new Error('[Embedding] Gemini returned empty embedding');
    return buildEmbeddingResult(values, 'gemini', modelName);
  });

  return result;
}

export async function generateEmbeddingWithMetadata(text: string): Promise<EmbeddingResult> {
  const cacheKey = text.substring(0, 500);

  const l1Hit = getL1Cached(cacheKey);
  if (l1Hit) return l1Hit;

  const l2Hit = await getL2Cached(cacheKey);
  if (l2Hit) {
    setL1Cache(cacheKey, l2Hit);
    return l2Hit;
  }

  let result: EmbeddingResult | null = null;

  try {
    result = await embedWithGemini(text);
  } catch (err: any) {
    const message = String(err?.message || err);
    if (isRateLimitError(err)) {
      console.warn('[Embedding] Gemini rate limited');
    } else {
      console.warn('[Embedding] Gemini embedding failed:', message);
    }
  }

  if (!result) {
    console.warn('[Embedding] Gemini failed — returning degraded zero vector (keyword fallback)');
    result = {
      vector: new Array(EMBEDDING_DIM).fill(0),
      dimension: EMBEDDING_DIM,
      provider: 'zero_vector',
      model: 'zero-vector-fallback',
      degraded: true,
    };
  }

  setL1Cache(cacheKey, result);
  setL2Cache(cacheKey, result).catch(() => {});
  return result;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddingWithMetadata(text);
  return result.vector;
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIM;
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}