/**
 * @file store/index.ts
 * @description ContextStore — persistent storage for K, A, H, R context items.
 *   Backed by Supabase (PostgreSQL + pgvector).
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  KnowledgeItem,
  Artifact,
  HistoryItem,
  Relationship,
  Session,
  ContextFragment,
  PutResult,
  QueryFilters,
  ContextQueryResponse,
  SecurityTier,
  UUID,
  NodeCapability,
  SessionOpenResponse,
  CloseResult,
} from './schema.js';
import { SECURITY_TIER_ORDER } from './schema.js';
import type { UCOLSupabaseClient } from './supabase.js';
import {
  knowledgeToRow,
  artifactToRow,
  rowToKnowledge,
  rowToArtifact,
  rowToHistory,
  rowToRelationship,
  rowToSession,
} from './supabase.js';

/** Tiers allowed to be queried by a given clearance (inclusive) */
const VISIBLE_TIERS: Record<SecurityTier, SecurityTier[]> = {
  PUBLIC: ['PUBLIC'],
  INTERNAL: ['PUBLIC', 'INTERNAL'],
  CONFIDENTIAL: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
  RESTRICTED: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'],
};

/**
 * ContextStore — unified read/write access to the UCOL context graph.
 *
 * Handles upsert and query for all four context item types:
 * K (knowledge), A (artifacts), H (history), R (relationships).
 */
export class ContextStore {
  private readonly supabase: UCOLSupabaseClient;

  /**
   * @param supabase - Typed Supabase client (service role)
   */
  constructor(supabase: UCOLSupabaseClient) {
    this.supabase = supabase;
  }

  // ─── Knowledge (K) ─────────────────────────────────────────────────────────

  /**
   * Upsert a Knowledge Item into the store.
   * If an item with the same ID exists, it is updated.
   *
   * @param item - KnowledgeItem to persist
   * @returns The stored item
   */
  async upsertKnowledge(item: KnowledgeItem): Promise<KnowledgeItem> {
    const row = knowledgeToRow(item);
    const { data, error } = await this.supabase
      .from('ucol_knowledge')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new Error(`upsertKnowledge failed: ${error.message}`);
    return rowToKnowledge(data);
  }

  /**
   * Retrieve a Knowledge Item by ID.
   *
   * @param id - UUID of the knowledge item
   * @returns KnowledgeItem or null if not found
   */
  async getKnowledge(id: UUID): Promise<KnowledgeItem | null> {
    const { data, error } = await this.supabase
      .from('ucol_knowledge')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getKnowledge failed: ${error.message}`);
    }
    return data ? rowToKnowledge(data) : null;
  }

  /**
   * Vector similarity search for Knowledge Items.
   *
   * @param embedding - 768-dim query embedding
   * @param clearance - Max security tier the caller may access
   * @param k - Number of results (default: 20)
   * @param minConfidence - Minimum confidence threshold
   * @returns Ranked knowledge items with similarity scores
   */
  async searchKnowledge(
    embedding: number[],
    clearance: SecurityTier,
    k: number = 20,
    minConfidence: number = 0.0
  ): Promise<Array<KnowledgeItem & { similarity: number }>> {
    const { data, error } = await this.supabase.rpc('ucol_search_knowledge', {
      query_embedding: embedding,
      security_tier_max: clearance,
      match_count: k,
      min_confidence: minConfidence,
    });

    if (error) throw new Error(`searchKnowledge failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      ...rowToKnowledge(row),
      similarity: row.similarity,
    }));
  }

  /**
   * Query Knowledge Items by filters (without vector search).
   *
   * @param filters - Query filters
   * @returns Matching knowledge items
   */
  async queryKnowledge(filters: QueryFilters): Promise<KnowledgeItem[]> {
    let q = this.supabase.from('ucol_knowledge').select('*');

    const clearance = filters.security_tier_max ?? 'PUBLIC';
    const visibleTiers = VISIBLE_TIERS[clearance];
    q = q.in('security_tier', visibleTiers);

    if (filters.knowledge_types && filters.knowledge_types.length > 0) {
      q = q.in('type', filters.knowledge_types);
    }
    if (filters.agent_id) {
      q = q.eq('source', filters.agent_id);
    }
    if (filters.min_confidence !== undefined) {
      q = q.gte('confidence', filters.min_confidence);
    }
    if (filters.valid_at) {
      q = q
        .lte('valid_from', filters.valid_at)
        .or(`valid_until.is.null,valid_until.gte.${filters.valid_at}`);
    }

    q = q.limit(filters.limit ?? 20);

    const { data, error } = await q;
    if (error) throw new Error(`queryKnowledge failed: ${error.message}`);
    return (data ?? []).map(rowToKnowledge);
  }

  // ─── Artifacts (A) ─────────────────────────────────────────────────────────

  /**
   * Upsert an Artifact into the store.
   *
   * @param artifact - Artifact to persist
   * @returns The stored artifact
   */
  async upsertArtifact(artifact: Artifact): Promise<Artifact> {
    const row = artifactToRow(artifact);
    const { data, error } = await this.supabase
      .from('ucol_artifacts')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw new Error(`upsertArtifact failed: ${error.message}`);
    return rowToArtifact(data);
  }

  /**
   * Retrieve an Artifact by ID.
   *
   * @param id - UUID of the artifact
   * @returns Artifact or null if not found
   */
  async getArtifact(id: UUID): Promise<Artifact | null> {
    const { data, error } = await this.supabase
      .from('ucol_artifacts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getArtifact failed: ${error.message}`);
    }
    return data ? rowToArtifact(data) : null;
  }

  // ─── History (H) ───────────────────────────────────────────────────────────

  /**
   * Insert a History Item (append-only, no upsert).
   *
   * @param item - HistoryItem to append
   */
  async insertHistory(item: HistoryItem): Promise<void> {
    const { error } = await this.supabase.from('ucol_history').insert({
      id: item.id,
      session_id: item.session_id,
      sequence: item.sequence,
      role: item.role,
      content: item.content,
      model_id: item.model_id,
      tokens_used: item.tokens_used,
      timestamp: item.timestamp,
      distilled: item.distilled,
      delta_k: item.delta_k,
      delta_a: item.delta_a,
    });

    if (error) throw new Error(`insertHistory failed: ${error.message}`);
  }

  /**
   * Retrieve all History Items for a session, ordered by sequence.
   *
   * @param sessionId - Session UUID
   * @param distilled - If provided, filter by distilled flag
   * @returns Ordered history items
   */
  async getSessionHistory(sessionId: UUID, distilled?: boolean): Promise<HistoryItem[]> {
    let q = this.supabase
      .from('ucol_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('sequence', { ascending: true });

    if (distilled !== undefined) {
      q = q.eq('distilled', distilled);
    }

    const { data, error } = await q;
    if (error) throw new Error(`getSessionHistory failed: ${error.message}`);
    return (data ?? []).map(rowToHistory);
  }

  /**
   * Mark History Items as distilled.
   *
   * @param ids - UUIDs of history items to mark
   */
  async markDistilled(ids: UUID[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.supabase
      .from('ucol_history')
      .update({ distilled: true })
      .in('id', ids);

    if (error) throw new Error(`markDistilled failed: ${error.message}`);
  }

  /**
   * Count raw (undistilled) bytes for a session.
   * Approximates byte count as sum of content string lengths.
   *
   * @param sessionId - Session UUID
   * @returns Approximate byte count
   */
  async getRawHistoryBytes(sessionId: UUID): Promise<number> {
    const items = await this.getSessionHistory(sessionId, false);
    return items.reduce((acc, h) => acc + Buffer.byteLength(h.content, 'utf8'), 0);
  }

  // ─── Relationships (R) ─────────────────────────────────────────────────────

  /**
   * Upsert a Relationship into the store.
   *
   * @param rel - Relationship to persist
   */
  async upsertRelationship(rel: Relationship): Promise<void> {
    const { error } = await this.supabase
      .from('ucol_relationships')
      .upsert(
        {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          type: rel.type,
          weight: rel.weight,
          confidence: rel.confidence,
          created_by: rel.created_by,
          created_at: rel.created_at,
          evidence: rel.evidence,
        },
        { onConflict: 'id' }
      );

    if (error) throw new Error(`upsertRelationship failed: ${error.message}`);
  }

  /**
   * Get all relationships for a given entity (as source or target).
   *
   * @param entityId - K_i or A_i UUID
   * @returns Relationships involving this entity
   */
  async getRelationships(entityId: UUID): Promise<Relationship[]> {
    const { data, error } = await this.supabase
      .from('ucol_relationships')
      .select('*')
      .or(`source.eq.${entityId},target.eq.${entityId}`);

    if (error) throw new Error(`getRelationships failed: ${error.message}`);
    return (data ?? []).map(rowToRelationship);
  }

  // ─── Sessions ───────────────────────────────────────────────────────────────

  /**
   * Create or update a session record.
   *
   * @param session - Session to upsert
   */
  async upsertSession(session: Session): Promise<void> {
    const { error } = await this.supabase.from('ucol_sessions').upsert(
      {
        session_id: session.session_id,
        agent_id: session.agent_id,
        granted_capabilities: session.granted_capabilities,
        security_clearance: session.security_clearance,
        created_at: session.created_at,
        expires_at: session.expires_at,
        h_bytes: session.h_bytes,
        history_count: session.history_count,
      },
      { onConflict: 'session_id' }
    );

    if (error) throw new Error(`upsertSession failed: ${error.message}`);
  }

  /**
   * Get a session by ID.
   *
   * @param sessionId - Session UUID
   * @returns Session or null
   */
  async getSession(sessionId: UUID): Promise<Session | null> {
    const { data, error } = await this.supabase
      .from('ucol_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`getSession failed: ${error.message}`);
    }
    return data ? rowToSession(data) : null;
  }

  /**
   * Delete a session record.
   *
   * @param sessionId - Session UUID
   */
  async deleteSession(sessionId: UUID): Promise<void> {
    const { error } = await this.supabase
      .from('ucol_sessions')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw new Error(`deleteSession failed: ${error.message}`);
  }

  // ─── Unified Fragment Store ─────────────────────────────────────────────────

  /**
   * Store a ContextFragment (all four types) and return a PutResult.
   *
   * @param fragment - ContextFragment with optional K, A, H, R arrays
   * @param _sessionId - Owning session UUID (used for H items)
   * @returns PutResult with context_id and items_stored count
   */
  async putFragment(fragment: ContextFragment, _sessionId: UUID): Promise<PutResult> {
    const contextId = uuidv4();
    let count = 0;

    const knowledge = fragment.knowledge ?? [];
    const artifacts = fragment.artifacts ?? [];
    const history = fragment.history ?? [];
    const relationships = fragment.relationships ?? [];

    for (const k of knowledge) {
      await this.upsertKnowledge(k);
      count++;
    }
    for (const a of artifacts) {
      await this.upsertArtifact(a);
      count++;
    }
    for (const h of history) {
      await this.insertHistory({ ...h, session_id: h.session_id || _sessionId });
      count++;
    }
    for (const r of relationships) {
      await this.upsertRelationship(r);
      count++;
    }

    return { context_id: contextId, items_stored: count };
  }

  /**
   * Unified context query — returns K, A, H items matching filters.
   * When an embedding is provided, uses vector search for K items.
   *
   * @param query - Natural language query string
   * @param filters - Query filters
   * @param embedding - Optional 768-dim embedding for semantic search
   * @returns ContextQueryResponse with items and scores
   */
  async queryContext(
    query: string,
    filters: QueryFilters,
    embedding?: number[]
  ): Promise<ContextQueryResponse> {
    const items: ContextQueryResponse['items'] = [];
    const scores: number[] = [];

    // K items — prefer vector search when embedding available
    const types = filters.types;
    const includeK = !types || types.includes('knowledge');
    const includeA = !types || types.includes('artifact');
    const includeH = !types || types.includes('history');

    if (includeK) {
      if (embedding) {
        const kResults = await this.searchKnowledge(
          embedding,
          filters.security_tier_max ?? 'PUBLIC',
          filters.limit ?? 20,
          filters.min_confidence ?? 0.0
        );
        for (const kr of kResults) {
          const { similarity, ...item } = kr;
          items.push(item);
          scores.push(similarity);
        }
      } else {
        const kItems = await this.queryKnowledge(filters);
        for (const k of kItems) {
          items.push(k);
          scores.push(k.confidence);
        }
      }
    }

    // A items (simple filter, no vector search)
    if (includeA) {
      const clearance = filters.security_tier_max ?? 'PUBLIC';
      const visibleTiers = VISIBLE_TIERS[clearance];
      let q = this.supabase
        .from('ucol_artifacts')
        .select('*')
        .in('security_tier', visibleTiers)
        .limit(filters.limit ?? 20);

      if (filters.agent_id) q = q.eq('produced_by', filters.agent_id);

      const { data: aData } = await q;
      for (const a of aData ?? []) {
        items.push(rowToArtifact(a));
        scores.push(0.5); // default score for non-vector artifacts
      }
    }

    // H items (session-scoped)
    if (includeH && filters.session_id) {
      const hItems = await this.getSessionHistory(filters.session_id);
      for (const h of hItems.slice(0, filters.limit ?? 20)) {
        items.push(h);
        scores.push(0.5);
      }
    }

    return {
      items,
      scores,
      total_matched: items.length,
    };
  }
}
