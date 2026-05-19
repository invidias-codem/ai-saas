/**
 * embedding.ts — Unified Embedding Provider
 *
 * Primary:  Vast.ai / self-hosted embeddings (768-dim)
 * Secondary: Gemini embeddings (3072-dim)
 *
 * Important architectural shift:
 * Embeddings are no longer treated as anonymous vectors.
 * They are provider-specific retrieval artifacts with an explicit
 * dimension and retrieval lane.
 */

const PRIMARY_EMBEDDING_DIM = 768;
const SECONDARY_EMBEDDING_DIM = 3072;
const L1_CACHE_TTL_MS = 1000 * 60 * 60;
const L2_CACHE_TTL_SEC = 60 * 60 * 24;
const MAX_L1_CACHE_SIZE = 100;
const OLLAMA_TIMEOUT_MS = 10_000;
const REDIS_KEY_PREFIX = 'embed:v2:';

export type EmbeddingDimension = 768 | 3072;
export type EmbeddingProvider = 'self_hosted' | 'gemini' | 'zero_vector';

export type EmbeddingResult = {
  vector: number[];
  dimension: EmbeddingDimension;
  provider: EmbeddingProvider;
  model: string;
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
      (parsed.dimension === PRIMARY_EMBEDDING_DIM || parsed.dimension === SECONDARY_EMBEDDING_DIM) &&
      parsed.vector.length === parsed.dimension
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

function ensureHttps(rawUrl: string): string {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  return `https://${rawUrl}`;
}

function buildEmbeddingResult(
  vector: number[],
  provider: EmbeddingProvider,
  model: string
): EmbeddingResult {
  const dimension = vector.length;
  if (dimension !== PRIMARY_EMBEDDING_DIM && dimension !== SECONDARY_EMBEDDING_DIM) {
    throw new Error(`[Embedding] Unsupported embedding dimension: ${dimension}`);
  }
  return {
    vector,
    dimension: dimension as EmbeddingDimension,
    provider,
    model,
  };
}

async function embedWithLambda(text: string): Promise<EmbeddingResult> {
  const embedUrl = process.env.LAMBDA_EMBED_URL ? ensureHttps(process.env.LAMBDA_EMBED_URL) : undefined;
  const ollamaUrl = process.env.LAMBDA_OLLAMA_URL ? ensureHttps(process.env.LAMBDA_OLLAMA_URL) : undefined;

  if (embedUrl) {
    const url = `${embedUrl.replace(/\/$/, '')}/v1/embeddings`;
    const model = process.env.EMBED_MODEL || 'BAAI/bge-base-en-v1.5';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, model }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`[Embedding] Lambda embed server HTTP ${res.status}: ${body}`);
      }
      const json = await res.json();
      const embedding = json?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('[Embedding] Lambda embed server returned empty embedding');
      }
      return buildEmbeddingResult(embedding as number[], 'self_hosted', model);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (ollamaUrl) {
    const model = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    const url = `${ollamaUrl.replace(/\/$/, '')}/api/embeddings`;
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
      return buildEmbeddingResult(json.embedding as number[], 'self_hosted', model);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('[Embedding] Neither LAMBDA_EMBED_URL nor LAMBDA_OLLAMA_URL is set');
}

async function embedWithGemini(text: string): Promise<EmbeddingResult> {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('[Embedding] GOOGLE_API_KEY not set');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  // Using the latest multimodal embedding model which natively outputs 3072 dimensions
  const modelName = 'gemini-embedding-2-preview';
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.embedContent(text);
  const values = result.embedding?.values ?? [];
  if (values.length === 0) throw new Error('[Embedding] Gemini returned empty embedding');
  return buildEmbeddingResult(values, 'gemini', modelName);
}

export async function generateEmbeddingWithMetadata(text: string): Promise<EmbeddingResult> {
  const cacheKey = text.substring(0, 500);

  const l1Hit = getL1Cached(cacheKey);
  if (l1Hit) {
    console.log('[Embedding] L1 cache hit', { provider: l1Hit.provider, dimension: l1Hit.dimension });
    return l1Hit;
  }

  const l2Hit = await getL2Cached(cacheKey);
  if (l2Hit) {
    console.log('[Embedding] L2 cache hit', { provider: l2Hit.provider, dimension: l2Hit.dimension });
    setL1Cache(cacheKey, l2Hit);
    return l2Hit;
  }

  let result: EmbeddingResult | null = null;

  if (process.env.LAMBDA_EMBED_URL || process.env.LAMBDA_OLLAMA_URL) {
    try {
      result = await embedWithLambda(text);
      console.log('[Embedding] Self-hosted OK', {
        provider: result.provider,
        model: result.model,
        dimension: result.dimension,
      });
    } catch (err) {
      console.warn('[Embedding] Vast.ai / self-hosted failed, trying fallback:', err);
    }
  }

  if (!result && process.env.GOOGLE_API_KEY) {
    try {
      result = await embedWithGemini(text);
      console.log('[Embedding] Gemini OK', {
        provider: result.provider,
        model: result.model,
        dimension: result.dimension,
        lane: result.dimension === PRIMARY_EMBEDDING_DIM ? 'primary_768' : 'secondary_3072',
      });
    } catch (err: any) {
      if (err?.status === 429 || String(err).includes('429')) {
        console.warn('[Embedding] Gemini rate limited');
      } else {
        console.warn('[Embedding] Gemini failed:', err);
      }
    }
  }

  if (!result) {
    console.warn('[Embedding] All providers failed — returning zero vector');
    result = {
      vector: new Array(PRIMARY_EMBEDDING_DIM).fill(0),
      dimension: PRIMARY_EMBEDDING_DIM,
      provider: 'zero_vector',
      model: 'zero-vector-fallback',
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
  return PRIMARY_EMBEDDING_DIM;
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}
