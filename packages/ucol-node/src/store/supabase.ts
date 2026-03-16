/**
 * @file store/supabase.ts
 * @description Supabase client initialization and table helper types for UCOL.
 *   All operations use the service role key (server-side only).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  KnowledgeItem,
  Artifact,
  HistoryItem,
  Relationship,
  Session,
  SecurityTier,
  SECURITY_TIER_ORDER,
} from './schema.js';

// ─── Table Row Types (DB representation) ─────────────────────────────────────

/** ucol_knowledge table row */
export interface KnowledgeRow {
  id: string;
  content: string;
  type: string;
  confidence: number;
  source: string;
  valid_from: string;
  valid_until: string | null;
  provenance: string;
  signature: string;
  embedding: number[] | null;
  security_tier: string;
  created_at: string;
}

/** ucol_artifacts table row */
export interface ArtifactRow {
  id: string;
  type: string;
  content: string;
  mime_type: string;
  version: string;
  dependencies: string[];
  produced_by: string;
  produced_at: string;
  checksum: string;
  signature: string;
  security_tier: string;
  description: string | null;
  created_at: string;
}

/** ucol_history table row */
export interface HistoryRow {
  id: string;
  session_id: string;
  sequence: number;
  role: string;
  content: string;
  model_id: string | null;
  tokens_used: number;
  timestamp: string;
  distilled: boolean;
  delta_k: string[];
  delta_a: string[];
}

/** ucol_relationships table row */
export interface RelationshipRow {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  confidence: number;
  created_by: string;
  created_at: string;
  evidence: string[];
}

/** ucol_sessions table row */
export interface SessionRow {
  session_id: string;
  agent_id: string;
  granted_capabilities: string[];
  security_clearance: string;
  created_at: string;
  expires_at: string;
  h_bytes: number;
  history_count: number;
}

// ─── Database interface for typed Supabase client ────────────────────────────

export interface Database {
  public: {
    Tables: {
      ucol_knowledge: {
        Row: KnowledgeRow;
        Insert: Omit<KnowledgeRow, 'created_at'> & { created_at?: string };
        Update: Partial<KnowledgeRow>;
      };
      ucol_artifacts: {
        Row: ArtifactRow;
        Insert: Omit<ArtifactRow, 'created_at'> & { created_at?: string };
        Update: Partial<ArtifactRow>;
      };
      ucol_history: {
        Row: HistoryRow;
        Insert: HistoryRow;
        Update: Partial<HistoryRow>;
      };
      ucol_relationships: {
        Row: RelationshipRow;
        Insert: RelationshipRow;
        Update: Partial<RelationshipRow>;
      };
      ucol_sessions: {
        Row: SessionRow;
        Insert: SessionRow;
        Update: Partial<SessionRow>;
      };
    };
    Functions: {
      ucol_search_knowledge: {
        Args: {
          query_embedding: number[];
          security_tier_max: string;
          match_count: number;
          min_confidence?: number;
        };
        Returns: (KnowledgeRow & { similarity: number })[];
      };
    };
  };
}

/** Typed Supabase client for UCOL */
export type UCOLSupabaseClient = SupabaseClient<Database>;

/**
 * Create a typed Supabase client for UCOL operations.
 *
 * @param url - Supabase project URL
 * @param key - Supabase service role key (never expose client-side)
 * @returns Typed SupabaseClient
 */
export function createUCOLClient(url: string, key: string): UCOLSupabaseClient {
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

// ─── Row ↔ Domain Mappers ─────────────────────────────────────────────────────

/** Convert a DB row to a KnowledgeItem domain object */
export function rowToKnowledge(row: KnowledgeRow): KnowledgeItem {
  return {
    id: row.id,
    content: row.content,
    type: row.type as KnowledgeItem['type'],
    confidence: row.confidence,
    source: row.source,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    provenance: row.provenance,
    signature: row.signature,
    embedding: row.embedding,
    security_tier: row.security_tier as SecurityTier,
  };
}

/** Convert a KnowledgeItem to a DB insert row */
export function knowledgeToRow(k: KnowledgeItem): Omit<KnowledgeRow, 'created_at'> {
  return {
    id: k.id,
    content: k.content,
    type: k.type,
    confidence: k.confidence,
    source: k.source,
    valid_from: k.valid_from,
    valid_until: k.valid_until,
    provenance: k.provenance,
    signature: k.signature,
    embedding: k.embedding,
    security_tier: k.security_tier,
  };
}

/** Convert a DB row to an Artifact domain object */
export function rowToArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    type: row.type as Artifact['type'],
    content: row.content,
    mime_type: row.mime_type,
    version: row.version,
    dependencies: row.dependencies,
    produced_by: row.produced_by,
    produced_at: row.produced_at,
    checksum: row.checksum,
    signature: row.signature,
    security_tier: row.security_tier as SecurityTier,
    description: row.description ?? undefined,
  };
}

/** Convert an Artifact to a DB insert row */
export function artifactToRow(a: Artifact): Omit<ArtifactRow, 'created_at'> {
  return {
    id: a.id,
    type: a.type,
    content: a.content,
    mime_type: a.mime_type,
    version: a.version,
    dependencies: a.dependencies,
    produced_by: a.produced_by,
    produced_at: a.produced_at,
    checksum: a.checksum,
    signature: a.signature,
    security_tier: a.security_tier,
    description: a.description ?? null,
  };
}

/** Convert a DB row to a HistoryItem domain object */
export function rowToHistory(row: HistoryRow): HistoryItem {
  return {
    id: row.id,
    session_id: row.session_id,
    sequence: row.sequence,
    role: row.role as HistoryItem['role'],
    content: row.content,
    model_id: row.model_id,
    tokens_used: row.tokens_used,
    timestamp: row.timestamp,
    distilled: row.distilled,
    delta_k: row.delta_k,
    delta_a: row.delta_a,
  };
}

/** Convert a DB row to a Relationship domain object */
export function rowToRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    type: row.type as Relationship['type'],
    weight: row.weight,
    confidence: row.confidence,
    created_by: row.created_by,
    created_at: row.created_at,
    evidence: row.evidence,
  };
}

/** Convert a DB row to a Session domain object */
export function rowToSession(row: SessionRow): Session {
  return {
    session_id: row.session_id,
    agent_id: row.agent_id,
    granted_capabilities: row.granted_capabilities as Session['granted_capabilities'],
    security_clearance: row.security_clearance as SecurityTier,
    created_at: row.created_at,
    expires_at: row.expires_at,
    h_bytes: row.h_bytes,
    history_count: row.history_count,
  };
}
