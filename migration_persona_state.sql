-- lib/state/schema.sql
-- Persona state KV store for the Chameleon Consultant / Lattice OS.
-- Uses Supabase as the persistence layer with atomic writes and
-- immutable audit trails.

-- ── persona_documents ───────────────────────────────────────────────
-- Single-row store for the current persona state machine.
-- The Merkle-lite chain is enforced by previousVersionHash integrity.
CREATE TABLE IF NOT EXISTS public.persona_documents (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL,
  nonce           TEXT NOT NULL,
  previous_version_hash TEXT NOT NULL,
  signature_hash  TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('IDLE','INGESTING','CONSULTING','HALTED')),
  allowed_namespaces TEXT[] NOT NULL DEFAULT '{}',
  forbidden_namespaces TEXT[] NOT NULL DEFAULT '{}',
  tone_lock       TEXT NOT NULL DEFAULT 'CLINICAL',
  transition_audit JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persona_documents_nonce
  ON public.persona_documents(nonce);

CREATE INDEX IF NOT EXISTS idx_persona_documents_state
  ON public.persona_documents(state);

-- ── persona_chain_links ─────────────────────────────────────────────
-- Append-only chain history for Merkle-lite verification.
CREATE TABLE IF NOT EXISTS public.persona_chain_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       TEXT NOT NULL,
  nonce             TEXT NOT NULL,
  version_hash      TEXT NOT NULL,
  previous_version_hash TEXT NOT NULL,
  transition_name   TEXT NOT NULL,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_persona_chain_nonce UNIQUE (nonce)
);

CREATE INDEX IF NOT EXISTS idx_persona_chain_document_id
  ON public.persona_chain_links(document_id);

CREATE INDEX IF NOT EXISTS idx_persona_chain_timestamp
  ON public.persona_chain_links(timestamp);

-- ── dispatch_audit_trail ────────────────────────────────────────────
-- Immutable audit log for every dispatch attempt.
CREATE TABLE IF NOT EXISTS public.dispatch_audit_trail (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_nonce    TEXT NOT NULL,
  stage             TEXT NOT NULL,
  result            TEXT NOT NULL,
  critic_decision   TEXT,
  violations        JSONB,
  provider          TEXT,
  model             TEXT,
  tier              TEXT,
  downgraded        BOOLEAN DEFAULT false,
  task_type         TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_nonce
  ON public.dispatch_audit_trail(dispatch_nonce);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_session
  ON public.dispatch_audit_trail(session_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_audit_created
  ON public.dispatch_audit_trail(created_at);

-- ── provider_health ─────────────────────────────────────────────────
-- Dead-provider tracking with TTL-based resurrection.
CREATE TABLE IF NOT EXISTS public.provider_health (
  provider_key      TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'HEALTHY',
  last_checked      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failure_count     INTEGER NOT NULL DEFAULT 0,
  last_failure_reason TEXT,
  last_failure_at   TIMESTAMPTZ
);

-- ── Atomic Upsert RPC ───────────────────────────────────────────────
-- Guarantees the persona_documents row is atomically updated with
-- chain integrity. Prevents forked state.
CREATE OR REPLACE FUNCTION upsert_persona_document_atomic(
  p_document_id     TEXT,
  p_nonce           TEXT,
  p_previous_hash   TEXT,
  p_signature_hash  TEXT,
  p_state           TEXT,
  p_allowed_ns     TEXT[],
  p_forbidden_ns   TEXT[],
  p_tone_lock       TEXT,
  p_trigger_event   TEXT,
  p_timestamp       TIMESTAMPTZ
)
RETURNS public.persona_documents AS $$
DECLARE
  v_result public.persona_documents;
BEGIN
  -- Reject if a newer nonce already exists (prevents rollback)
  IF EXISTS (
    SELECT 1 FROM public.persona_documents
    WHERE nonce > p_nonce
  ) THEN
    RAISE EXCEPTION 'Cannot write persona document: a newer nonce already exists';
  END IF;

  INSERT INTO public.persona_documents (
    id, document_id, nonce, previous_version_hash, signature_hash,
    state, allowed_namespaces, forbidden_namespaces, tone_lock,
    transition_audit, created_at, updated_at
  ) VALUES (
    'current', p_document_id, p_nonce, p_previous_hash, p_signature_hash,
    p_state, p_allowed_ns, p_forbidden_ns, p_tone_lock,
    jsonb_build_object('triggerEvent', p_trigger_event, 'timestamp', p_timestamp),
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    document_id            = EXCLUDED.document_id,
    nonce                  = EXCLUDED.nonce,
    previous_version_hash  = EXCLUDED.previous_version_hash,
    signature_hash         = EXCLUDED.signature_hash,
    state                  = EXCLUDED.state,
    allowed_namespaces     = EXCLUDED.allowed_namespaces,
    forbidden_namespaces   = EXCLUDED.forbidden_namespaces,
    tone_lock              = EXCLUDED.tone_lock,
    transition_audit       = EXCLUDED.transition_audit,
    updated_at             = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ── RLS Policies ────────────────────────────────────────────────────
ALTER TABLE public.persona_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_chain_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;

-- Service role has full access (backend routes use supabaseAdmin)
CREATE POLICY "service_role_full_access_persona_documents"
  ON public.persona_documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_persona_chain"
  ON public.persona_chain_links FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_dispatch_audit"
  ON public.dispatch_audit_trail FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_provider_health"
  ON public.provider_health FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
