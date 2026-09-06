// lib/ai/nimEmbeddingClient.ts
//
// Local-first NVIDIA NIM embedding client with environment-aware hybrid routing.
//
// Routing:
//   LATTICE_NIM_MODE=local  → http://127.0.0.1:8000/v1/embeddings
//   LATTICE_NIM_MODE=cloud  → NVIDIA_NIM_CLOUD_URL / NVIDIA_API_KEY
//
// macOS note: the local daemon will fail to bind GPUs (no NVIDIA container
// toolkit on Apple Silicon). The client detects that and falls back to cloud
// automatically without crashing the caller.

import { env, nvidiaNimConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

const DEFAULT_EMBED_MODEL = 'nvidia/nv-embedqa-e5-v5';
const DEFAULT_EMBED_DIM = 1024;
const PING_TIMEOUT_MS = 800;
const HEALTH_ENDPOINT = '/v1/embeddings';
const MAX_RETRIES = 4;
const RETRY_BASE_MS = 250;
const RETRY_MAX_MS = 3000;
const MAX_BATCH = 64;

type EmbeddingResult = {
  vector: number[];
  model: string;
  provider: 'nim-local' | 'nim-cloud';
};

type EmbedRequest = {
  input: string | string[];
  model?: string;
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number | undefined, err: unknown): boolean {
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  const message = String(err instanceof Error ? err.message : err);
  return /socket hang up|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < MAX_RETRIES) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err instanceof Error && /status (\d+)/.test(err.message)
        ? Number(new RegExp(/status (\d+)/).exec(err.message)?.[1])
        : undefined;
      if (!isRetryable(status, err) || attempt >= MAX_RETRIES - 1) {
        break;
      }
      const jitter = Math.floor(Math.random() * 150);
      const delay = Math.min(RETRY_BASE_MS * 2 ** attempt + jitter, RETRY_MAX_MS);
      logger.warn(`[NimEmbeddingClient] ${label} attempt ${attempt + 1}/${MAX_RETRIES} retrying in ${delay}ms`, err);
      await sleep(delay);
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function probeLocal(baseUrl: string, apiKey: string | null): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, '')}${HEALTH_ENDPOINT}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ input: 'ping', model: DEFAULT_EMBED_MODEL, dimensions: DEFAULT_EMBED_DIM }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function resolveEndpoint(): { url: string; apiKey: string | null; provider: 'nim-local' | 'nim-cloud' } {
  const mode = env.LATTICE_NIM_MODE ?? 'local';
  if (mode === 'cloud') {
    const cfg = nvidiaNimConfig();
    return {
      url: env.LATTICE_NIM_CLOUD_URL ?? 'https://integrate.api.nvidia.com/v1',
      apiKey: cfg?.apiKey ?? env.LATTICE_NIM_CLOUD_API_KEY ?? null,
      provider: 'nim-cloud',
    };
  }
  // local mode — try local first, fall back to cloud
  const localApiKey = nvidiaNimConfig()?.apiKey ?? null;
  return {
    url: env.LATTICE_NIM_LOCAL_URL ?? 'http://127.0.0.1:8000/v1',
    apiKey: localApiKey,
    provider: 'nim-local',
  };
}

export async function ensureCloudEndpoint(): Promise<{ url: string; apiKey: string | null; provider: 'nim-local' | 'nim-cloud' }> {
  const cfg = resolveEndpoint();
  if (cfg.provider === 'nim-cloud') return cfg;

  const reachable = await probeLocal(cfg.url, cfg.apiKey);
  if (reachable) return cfg;

  logger.warn('[NimEmbeddingClient] local NIM unreachable, falling back to cloud');
  return {
    url: env.LATTICE_NIM_CLOUD_URL ?? 'https://integrate.api.nvidia.com/v1',
    apiKey: nvidiaNimConfig()?.apiKey ?? env.LATTICE_NIM_CLOUD_API_KEY ?? null,
    provider: 'nim-cloud',
  };
}

export async function embed(
  text: string,
  opts?: { model?: string; dimensions?: number },
): Promise<EmbeddingResult> {
  return embedBatch([text], opts).then((r) => r[0]);
}

export async function embedBatch(
  inputs: string[],
  opts?: { model?: string; dimensions?: number; timeoutMs?: number },
): Promise<EmbeddingResult[]> {
  if (!inputs.length) return [];
  const model = opts?.model ?? env.LATTICE_NIM_EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
  const dimensions = opts?.dimensions ?? env.LATTICE_NIM_EMBED_DIM ?? DEFAULT_EMBED_DIM;
  const { url, apiKey, provider } = await ensureCloudEndpoint();

  const chunks: string[][] = [];
  for (let i = 0; i < inputs.length; i += MAX_BATCH) {
    chunks.push(inputs.slice(i, i + MAX_BATCH));
  }

  const results: EmbeddingResult[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    const body: EmbedRequest = {
      input: batch.length === 1 ? batch[0] : batch,
      model,
      encoding_format: 'float',
      dimensions,
    };

    const result = await withRetry(async () => {
      const controller = new AbortController();
      // Aligned to 50s (was 120s): an embedding still pending past 50s will never
      // complete under Vercel's post-response wind-down, so fast-fail and let
      // withRetry() reuse the remaining budget instead of silently dropping memory.
      const timeoutMs = opts?.timeoutMs ?? env.NIM_EMBEDDING_TIMEOUT_MS ?? 50_000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${url.replace(/\/$/, '')}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`NIM embeddings ${res.status}: ${text.slice(0, 300)}`);
        }
        const data = await res.json();
        const vectors: number[][] = data.data?.map((d: { embedding: number[] }) => d.embedding) ?? [];
        if (vectors.length !== batch.length) {
          throw new Error(`NIM batch mismatch: expected ${batch.length} embeddings, got ${vectors.length}`);
        }
        return vectors.map((vector) => ({ vector, model, provider }));
      } finally {
        clearTimeout(timer);
      }
    }, `batch ${i + 1}/${chunks.length}`);

    results.push(...result);
  }

  return results;
}

export { DEFAULT_EMBED_DIM, DEFAULT_EMBED_MODEL };
