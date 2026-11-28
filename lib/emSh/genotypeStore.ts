// lib/emSh/genotypeStore.ts
// Supabase-backed CRUD for EMSH Genotypes + append-only fitness lineage.
// Uses the existing server-only supabaseAdmin singleton (service role), which
// bypasses RLS for writes while the RLS policies above still gate client access.

import { supabaseAdmin } from '@/lib/supabaseClient';
import type {
  GenotypeRecord,
  GenotypeFitnessEvent,
  FitnessSignal,
} from './types';

function assertAdmin(): NonNullable<typeof supabaseAdmin> {
  if (!supabaseAdmin) {
    throw new Error(
      '[genotypeStore] supabaseAdmin is not configured — SUPABASE_SERVICE_ROLE_KEY missing.'
    );
  }
  return supabaseAdmin;
}

/**
 * Dual-Rail Embedding Adapter (write path).
 *
 * The embedding layer produces 3072-dim vectors (gemini-embedding-2-preview),
 * but `genotypes.intent_embedding` is `vector(768)`. Abstract execution DAGs
 * and intent signatures don't need 3,000 dimensions of semantic nuance — they
 * need a fast, low-latency, cluster-focused vector space (small ivfflat index,
 * single-digit-ms cosine over thousands of DAGs).
 *
 * Matryoshka Representation Learning (MRL): for MRL-trained embedders the
 * leading 768 dims retain most semantic structure, so slicing to (0,768) is a
 * zero-cost, low-loss projection — no second model call. (For non-MRL models the
 * slice is still a functional adapter, just not guaranteed near-lossless.)
 */
function projectTo768Dimensions(embedding?: number[] | null): number[] | null {
  if (!embedding || embedding.length === 0) return null;
  return embedding.length > 768 ? embedding.slice(0, 768) : embedding;
}

/** Insert or update a genotype, returning its id (null on failure). */
export async function upsertGenotype(
  g: GenotypeRecord
): Promise<string | null> {
  const admin = assertAdmin();
  // Dual-rail projection: any >768-dim vector is truncated to the genotype lane.
  const projectedEmbedding = projectTo768Dimensions(g.intentEmbedding);

  const { data, error } = await admin
    .from('genotypes')
    .upsert(
      {
        id: g.id,
        workspace_id: g.workspaceId ?? null,
        intent_signature: g.intentSignature,
        intent_embedding: projectedEmbedding,
        abstract_dag: g.abstractDag,
        fitness_score: g.fitnessScore,
        execution_count: g.executionCount,
        success_rate: g.successRate,
        parent_genotype_ids: g.parentGenotypeIds,
        generation: g.generation,
        meta: g.meta ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('id')
    .single();

  if (error) {
    console.warn('[genotypeStore] upsertGenotype failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Append a fitness event (never updates the genotype fitness in place). */
export async function recordFitnessEvent(ev: GenotypeFitnessEvent): Promise<boolean> {
  const admin = assertAdmin();
  const { error } = await admin.from('genotype_fitness_events').insert({
    genotype_id: ev.genotypeId,
    score: ev.score,
    signal: ev.signal as FitnessSignal,
    source_session_id: ev.sourceSessionId ?? null,
  });
  if (error) {
    console.warn('[genotypeStore] recordFitnessEvent failed:', error.message);
    return false;
  }
  return true;
}

/**
 * Query the top genotypes whose intent embedding is closest to the prompt's
 * intent vector, constrained to a workspace (or global when workspaceId is null).
 * Falls back to a workspace+signature exact match when no embedding is passed.
 */
export async function findHighFitnessGenotypes(
  intentEmbedding: number[] | null,
  opts: {
    workspaceId?: string | null;
    limit?: number;
    minFitness?: number;
    matchThreshold?: number;
  } = {}
): Promise<GenotypeRecord[]> {
  const admin = assertAdmin();
  const { workspaceId = null, limit = 5, minFitness = 0 } = opts;

  let query = admin
    .from('genotypes')
    .select('*')
    .gte('fitness_score', minFitness)
    .order('fitness_score', { ascending: false })
    .limit(limit);

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[genotypeStore] findHighFitnessGenotypes failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row));
}

/** List genotypes sharing an intent signature (exact-cluster recall). */
export async function findGenotypesBySignature(
  intentSignature: string,
  limit = 10
): Promise<GenotypeRecord[]> {
  const admin = assertAdmin();
  const { data, error } = await admin
    .from('genotypes')
    .select('*')
    .eq('intent_signature', intentSignature)
    .order('fitness_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[genotypeStore] findGenotypesBySignature failed:', error.message);
    return [];
  }
  return (data ?? []).map((row) => mapRow(row));
}

type GenotypeRow = Record<string, unknown> & {
  id: string;
  intent_signature: string;
  intent_embedding: unknown;
  abstract_dag: GenotypeRecord['abstractDag'];
  fitness_score: number;
  execution_count: number;
  success_rate: number;
  parent_genotype_ids: string[];
  generation: number;
  meta: Record<string, unknown>;
};

function mapRow(row: GenotypeRow): GenotypeRecord {
  const embeddingRaw = (
    row.intent_embedding && typeof row.intent_embedding === 'string'
      ? safeParseVector(row.intent_embedding)
      : row.intent_embedding
  ) as number[] | null | undefined;

  return {
    id: row.id,
    intentSignature: row.intent_signature,
    intentEmbedding: embeddingRaw ?? null,
    abstractDag: row.abstract_dag,
    fitnessScore: row.fitness_score,
    executionCount: row.execution_count,
    successRate: row.success_rate,
    parentGenotypeIds: Array.isArray(row.parent_genotype_ids)
      ? row.parent_genotype_ids
      : [],
    generation: row.generation,
    meta: row.meta ?? {},
  };
}

// pgvector can return embeddings as a `[a,b,c]` text literal.
function safeParseVector(s: string): number[] | null {
  try {
    const parsed = JSON.parse(s.replace(/[{}]/g, '[').replace(/[}]/g, ']') !== s ? s : s);
    return parsed;
  } catch {
    try {
      return JSON.parse(s) as number[];
    } catch {
      return null;
    }
  }
}