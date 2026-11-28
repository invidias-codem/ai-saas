/**
 * lib/state/kv.ts
 *
 * Lightweight Supabase-backed KV store for the persona state machine.
 * Fulfills the KV contract required by PersonaStateMachine, UCOL dispatch,
 * and the Weaver API routes.
 *
 * Tables (created by migration_persona_state.sql):
 *   - persona_documents: single-row store for the current persona state
 *   - persona_chain_links: append-only Merkle-lite chain history
 *   - dispatch_audit_trail: immutable audit log for every dispatch
 *   - provider_health: dead-provider tracking with TTL resurrection
 *
 * All writes use supabaseAdmin (service role) — no RLS overhead on the
 * critical path. Atomic upserts are enforced by the database RPC.
 */

import { supabaseAdmin } from "@/lib/supabaseClient";

// ── Exceptions ──────────────────────────────────────────────────────

export class KVStoreUnavailable extends Error {
  constructor() {
    super("Supabase KV store is not configured");
    this.name = "KVStoreUnavailable";
  }
}

export class KVAuthError extends Error {
  constructor(public readonly details: string) {
    super(`KV auth error: ${details}`);
    this.name = "KVAuthError";
  }
}

// ── Types ───────────────────────────────────────────────────────────

export interface PersonaDocumentRow {
  id: string;
  document_id: string;
  nonce: string;
  previous_version_hash: string;
  signature_hash: string;
  state: string;
  allowed_namespaces: string[];
  forbidden_namespaces: string[];
  tone_lock: string;
  transition_audit: {
    triggerEvent: string;
    timestamp: string;
  };
  created_at: string;
  updated_at: string;
}

export interface ChainLinkRow {
  id: string;
  document_id: string;
  nonce: string;
  version_hash: string;
  previous_version_hash: string;
  transition_name: string;
  timestamp: string;
}

export interface AuditEntryRow {
  id: string;
  dispatch_nonce: string;
  stage: string;
  result: string;
  critic_decision?: string;
  violations?: unknown;
  provider?: string;
  model?: string;
  tier?: string;
  downgraded?: boolean;
  task_type: string;
  session_id: string;
  created_at: string;
}

export interface ProviderHealthRow {
  provider_key: string;
  status: "HEALTHY" | "DEGRADED" | "DEAD";
  last_checked: string;
  failure_count: number;
  last_failure_reason?: string;
  last_failure_at?: string;
}

// ── KV Store ────────────────────────────────────────────────────────

export class SupabaseKV {
  private assertAdmin() {
    if (!supabaseAdmin) {
      throw new KVStoreUnavailable();
    }
    return supabaseAdmin;
  }

  // ── Generic KV ────────────────────────────────────────────────────

  async get(namespace: string, key: string): Promise<unknown> {
    const sb = this.assertAdmin();
    const { data, error } = await sb
      .from("kv_store")
      .select("value")
      .eq("namespace", namespace)
      .eq("key", key)
      .single();

    if (error || !data) return null;
    return data.value;
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    const sb = this.assertAdmin();
    const { error } = await sb
      .from("kv_store")
      .upsert(
        {
          namespace,
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "namespace,key" },
      );

    if (error) {
      throw new Error(`KV set failed: ${error.message}`);
    }
  }

  async del(namespace: string, key: string): Promise<void> {
    const sb = this.assertAdmin();
    const { error } = await sb
      .from("kv_store")
      .delete()
      .eq("namespace", namespace)
      .eq("key", key);

    if (error) {
      throw new Error(`KV del failed: ${error.message}`);
    }
  }

  // ── Persona State ─────────────────────────────────────────────────

  async getCurrentPersona(): Promise<PersonaDocumentRow | null> {
    const sb = this.assertAdmin();
    const { data, error } = await sb
      .from("persona_documents")
      .select("*")
      .eq("id", "current")
      .single();

    if (error || !data) return null;
    return data as PersonaDocumentRow;
  }

  async setCurrentPersona(doc: {
    documentId: string;
    nonce: string;
    previousVersionHash: string;
    signatureHash: string;
    state: string;
    allowedNamespaces: string[];
    forbiddenNamespaces: string[];
    toneLock: string;
    transitionAudit: { triggerEvent: string; timestamp: string };
  }): Promise<PersonaDocumentRow> {
    const sb = this.assertAdmin();

    const { data, error } = await sb.rpc("upsert_persona_document_atomic", {
      p_document_id: doc.documentId,
      p_nonce: doc.nonce,
      p_previous_hash: doc.previousVersionHash,
      p_signature_hash: doc.signatureHash,
      p_state: doc.state,
      p_allowed_ns: doc.allowedNamespaces,
      p_forbidden_ns: doc.forbiddenNamespaces,
      p_tone_lock: doc.toneLock,
      p_trigger_event: doc.transitionAudit.triggerEvent,
      p_timestamp: doc.transitionAudit.timestamp,
    });

    if (error || !data) {
      throw new Error(`Atomic persona upsert failed: ${error?.message ?? "unknown"}`);
    }

    return data as PersonaDocumentRow;
  }

  // ── Chain Links ───────────────────────────────────────────────────

  async appendChainLink(link: {
    documentId: string;
    nonce: string;
    versionHash: string;
    previousVersionHash: string;
    transitionName: string;
    timestamp: string;
  }): Promise<ChainLinkRow> {
    const sb = this.assertAdmin();

    const { data, error } = await sb
      .from("persona_chain_links")
      .insert({
        document_id: link.documentId,
        nonce: link.nonce,
        version_hash: link.versionHash,
        previous_version_hash: link.previousVersionHash,
        transition_name: link.transitionName,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Chain link append failed: ${error?.message ?? "unknown"}`);
    }

    return data as ChainLinkRow;
  }

  async getChainLinks(documentId: string): Promise<ChainLinkRow[]> {
    const sb = this.assertAdmin();

    const { data, error } = await sb
      .from("persona_chain_links")
      .select("*")
      .eq("document_id", documentId)
      .order("timestamp", { ascending: true });

    if (error || !data) return [];
    return data as ChainLinkRow[];
  }

  // ── Audit Trail ───────────────────────────────────────────────────

  async appendAuditEntry(entry: {
    dispatchNonce: string;
    stage: string;
    result: string;
    criticDecision?: string;
    violations?: unknown;
    provider?: string;
    model?: string;
    tier?: string;
    downgraded?: boolean;
    taskType: string;
    sessionId: string;
  }): Promise<AuditEntryRow> {
    const sb = this.assertAdmin();

    const { data, error } = await sb
      .from("dispatch_audit_trail")
      .insert({
        dispatch_nonce: entry.dispatchNonce,
        stage: entry.stage,
        result: entry.result,
        critic_decision: entry.criticDecision,
        violations: entry.violations,
        provider: entry.provider,
        model: entry.model,
        tier: entry.tier,
        downgraded: entry.downgraded ?? false,
        task_type: entry.taskType,
        session_id: entry.sessionId,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Audit append failed: ${error?.message ?? "unknown"}`);
    }

    return data as AuditEntryRow;
  }

  async getAuditEntriesBySession(sessionId: string): Promise<AuditEntryRow[]> {
    const sb = this.assertAdmin();

    const { data, error } = await sb
      .from("dispatch_audit_trail")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as AuditEntryRow[];
  }

  // ── Provider Health ───────────────────────────────────────────────

  async getProviderHealth(
    providerKey: string,
  ): Promise<ProviderHealthRow | null> {
    const sb = this.assertAdmin();
    const { data, error } = await sb
      .from("provider_health")
      .select("*")
      .eq("provider_key", providerKey)
      .single();

    if (error || !data) return null;
    return data as ProviderHealthRow;
  }

  async setProviderHealth(record: ProviderHealthRow): Promise<void> {
    const sb = this.assertAdmin();

    const { error } = await sb
      .from("provider_health")
      .upsert(
        {
          provider_key: record.provider_key,
          status: record.status,
          last_checked: record.last_checked,
          failure_count: record.failure_count,
          last_failure_reason: record.last_failure_reason,
          last_failure_at: record.last_failure_at,
        },
        { onConflict: "provider_key" },
      );

    if (error) {
      throw new Error(`Provider health write failed: ${error.message}`);
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────────

let kvInstance: SupabaseKV | null = null;

export function createStateKV(): SupabaseKV {
  if (!kvInstance) {
    kvInstance = new SupabaseKV();
  }
  return kvInstance;
}

export function resetStateKV(): void {
  kvInstance = null;
}
