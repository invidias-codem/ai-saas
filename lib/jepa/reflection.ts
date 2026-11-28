/**
 * lib/jepa/reflection.ts
 *
 * Orchestration helpers for the BiJEPA / H-JEPA reflection loop.
 *
 * This module is intentionally kept separate from the primary predictor
 * path so that the fast-path latency budget (<=15 ms) is never affected.
 * The reflection cycle is a fallback loop: Supabase I/O + secondary ONNX
 * inference, typically 150-300 ms.
 */

import { computeProductOfExperts } from './vjepa';

export const TAU_REFLECT = 0.80;
export const TAU_BREAKER = 0.95;

export interface ReflectionResult {
  zPast: number[];
  zHyperFuture: number[];
  memories: MemoryMatch[];
  latencyMs: number;
}

export interface MemoryMatch {
  id: string;
  embedding: number[];
  score: number;
  metadata?: Record<string, any>;
}

export interface ReflectionContext {
  zStuck: number[];
  zContext?: number[];
  matchRpc?: string;
  reflectEndpoint?: string;
}

function acoshStable(x: number): number {
  if (x <= 1) return 0;
  const sqrtArg = Math.sqrt(x);
  return Math.log(x + sqrtArg * Math.sqrt(x + 2));
}

export function poincareDistance(u: number[], v: number[]): number {
  if (u.length !== 128 || v.length !== 128) {
    throw new Error(`Poincaré vectors must be 128-d (got ${u.length}, ${v.length})`);
  }

  let uNormSq = 0;
  let vNormSq = 0;
  let diffNormSq = 0;
  for (let i = 0; i < 128; i++) {
    const du = u[i];
    const dv = v[i];
    uNormSq += du * du;
    vNormSq += dv * dv;
    diffNormSq += (du - dv) * (du - dv);
  }

  const EPS = 1e-8;
  const uDenom = Math.max(1 - uNormSq, EPS);
  const vDenom = Math.max(1 - vNormSq, EPS);
  const arg = 1 + (2 * diffNormSq) / (uDenom * vDenom);

  const dist = acoshStable(arg);
  return Number.isFinite(dist) ? dist : 0;
}

export function poincareNorm(x: number[]): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum);
}

export function projectToPoincare(x: number[], margin = 1e-6): number[] {
  const norm = poincareNorm(x);
  if (norm >= 1 - margin) {
    const scale = (1 - margin) / Math.max(norm, 1e-12);
    return x.map((v) => v * scale);
  }
  return x;
}

export async function callReflectionEndpoint(
  endpoint: string,
  zStuck: number[],
  zContext: number[],
): Promise<{ zPast: number[]; zHyperFuture: number[]; latencyMs: number }> {
  const started = Date.now();

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ z_stuck: zStuck, z_context: zContext }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`reflection endpoint ${resp.status}: ${text}`);
  }

  const json = (await resp.json()) as {
    z_past: number[];
    z_hyper_future: number[];
    latencyMs: number;
  };

  if (!Array.isArray(json.z_past) || json.z_past.length !== 128) {
    throw new Error('Invalid z_past dimension from reflection endpoint');
  }
  if (!Array.isArray(json.z_hyper_future) || json.z_hyper_future.length !== 128) {
    throw new Error('Invalid z_hyper_future dimension from reflection endpoint');
  }

  return {
    zPast: json.z_past,
    zHyperFuture: json.z_hyper_future,
    latencyMs: Date.now() - started,
  };
}

export async function executeReflectionLoop(ctx: ReflectionContext): Promise<ReflectionResult> {
  const endpoint = ctx.reflectEndpoint ?? '/api/jepa/reflect';
  const matchRpc = ctx.matchRpc ?? 'match_memories_128';
  const zContext = ctx.zContext ?? ctx.zStuck;

  const firstPass = await callReflectionEndpoint(endpoint, ctx.zStuck, zContext);
  const memories = await queryMatchMemories(matchRpc, firstPass.zPast);

  const topMemoryEmbedding =
    memories.length > 0 ? memories[0].embedding : zContext;

  const secondPass = await callReflectionEndpoint(
    endpoint,
    ctx.zStuck,
    topMemoryEmbedding,
  );

  return {
    zPast: firstPass.zPast,
    zHyperFuture: secondPass.zHyperFuture,
    memories,
    latencyMs: firstPass.latencyMs + secondPass.latencyMs,
  };
}

export async function queryMatchMemories(
  rpcName: string,
  queryEmbedding: number[],
  matchThreshold = 0.8,
  matchCount = 5,
): Promise<MemoryMatch[]> {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase env vars missing for reflection memory query');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc(rpcName, {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    throw new Error(`match_memories_128 RPC failed: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => ({
    id: String(row.id),
    embedding: Array.isArray(row.embedding) ? row.embedding.map(Number) : [],
    score: typeof row.score === 'number' ? row.score : 0,
    metadata: row.metadata ?? undefined,
  }));
}

export function applyReflectionPrior(
  dynMu: number[],
  dynVar: number[],
  zHyperFuture: number[],
  priorVar: number[] = [],
): { poeMu: number[]; poeVar: number[] } {
  const baselineVariance = 0.01;
  let densePriorVar: number[];
  if (priorVar.length === 128) {
    densePriorVar = priorVar;
  } else {
    densePriorVar = [];
    for (let i = 0; i < 128; i++) densePriorVar[i] = baselineVariance;
  }

  return computeProductOfExperts(dynMu, dynVar, zHyperFuture, densePriorVar, 1e-6);
}
