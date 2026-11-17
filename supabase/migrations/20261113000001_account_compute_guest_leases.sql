-- ============================================================================
-- Account Compute Plane — A3.4: durable guest state and execution leases.
--
-- account_compute_guests: one durable record per (owner_user_id, workspace_id).
--   Tracks the guest lifecycle phase, stable provider ID, generation (monotonic
--   CAS), quarantined state, and last error reason. Provider calls are NOT
--   transactional; the durable record is the source of truth and provider
--   operations require idempotent operation keys + evidence.
--
-- account_compute_guest_leases: exclusive execution lease per (owner, workspace).
--   One active lease at a time; fencing token verified by the in-VM command
--   runner before each guest operation. New leases are refused while the VM
--   is suspending (account-wide ready -> suspending fence).
--
-- Invariants:
--   * One guest record per account+workspace (composite UNIQUE).
--   * Lease acquisition and VM suspend transitions share DB serialization.
--   * Generation CAS on every mutation; stale callers fail closed.
--   * Provider failure retains the row in error/quarantine for reconciliation.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.account_compute_guests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id    TEXT NOT NULL,
    workspace_id     TEXT NOT NULL,
    provider_id      TEXT,                         -- stable provider/container ID
    phase            TEXT NOT NULL DEFAULT 'creating', -- creating|running|suspending|suspended|error|destroyed
    generation       INTEGER NOT NULL DEFAULT 1,   -- monotonic CAS counter
    operation_key    TEXT NOT NULL UNIQUE,         -- idempotency key for mutations
    error_reason     TEXT,
    quarantined      BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_compute_guests_owner
    ON public.account_compute_guests(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_guests_workspace
    ON public.account_compute_guests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_guests_owner_workspace
    ON public.account_compute_guests(owner_user_id, workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_compute_guests_unique_owner_workspace
    ON public.account_compute_guests(owner_user_id, workspace_id);

CREATE TABLE IF NOT EXISTS public.account_compute_guest_leases (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id    TEXT NOT NULL,
    workspace_id     TEXT NOT NULL,
    generation       INTEGER NOT NULL DEFAULT 1,   -- lease generation
    fencing_token    TEXT NOT NULL UNIQUE,         -- verified by in-VM runner
    acquired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes',
    UNIQUE (owner_user_id, workspace_id),          -- one active lease
    UNIQUE (fencing_token)
);

CREATE INDEX IF NOT EXISTS idx_account_compute_guest_leases_owner
    ON public.account_compute_guest_leases(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_guest_leases_workspace
    ON public.account_compute_guest_leases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_guest_leases_expires
    ON public.account_compute_guest_leases(expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_compute_guest_leases_unique_active
    ON public.account_compute_guest_leases(owner_user_id, workspace_id)
    WHERE expires_at > now();

-- updated_at maintenance.
DROP TRIGGER IF EXISTS trg_account_compute_guests_touch ON public.account_compute_guests;
CREATE TRIGGER trg_account_compute_guests_touch
    BEFORE UPDATE ON public.account_compute_guests
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_account_compute();

DROP TRIGGER IF EXISTS trg_account_compute_guest_leases_touch ON public.account_compute_guest_leases;
CREATE TRIGGER trg_account_compute_guest_leases_touch
    BEFORE UPDATE ON public.account_compute_guest_leases
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_account_compute();

-- RPC: acquire an exclusive execution lease for a guest.
--   Generates a fencing token verified by the in-VM command runner.
--   Rejects if the VM is suspending (account-wide fence).
CREATE OR REPLACE FUNCTION public.account_compute_acquire_guest_lease(
    p_owner_user_id   TEXT,
    p_workspace_id    TEXT,
    p_expected_generation INTEGER
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    guest record;
    existing record;
    token TEXT := encode(gen_random_bytes(16), 'hex');
BEGIN
    -- Resolve the guest record under lock.
    SELECT * INTO guest FROM public.account_compute_guests
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id
     FOR UPDATE;

    IF guest.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'guest not found');
    END IF;

    -- Generation CAS: reject stale callers.
    IF guest.generation <> p_expected_generation THEN
        RETURN json_build_object('ok', false, 'reason', 'stale generation',
            'expected', p_expected_generation, 'actual', guest.generation);
    END IF;

    -- Account-wide suspension fence: refuse new leases while suspending.
    IF guest.phase = 'suspending' THEN
        RETURN json_build_object('ok', false, 'reason', 'vm suspending',
            'generation', guest.generation);
    END IF;

    -- Idempotency: return the existing active lease if still valid.
    SELECT * INTO existing FROM public.account_compute_guest_leases
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id
       AND expires_at > now()
     FOR UPDATE;

    IF existing.owner_user_id IS NOT NULL THEN
        RETURN json_build_object(
            'ok', true, 'replay', true,
            'fencing_token', existing.fencing_token,
            'generation', existing.generation,
            'expires_at', existing.expires_at
        );
    END IF;

    -- Insert the new lease. UNIQUE(owner, workspace) + partial unique index
    -- on active leases prevents concurrent leases under serialization.
    INSERT INTO public.account_compute_guest_leases (
        owner_user_id, workspace_id, generation, fencing_token, acquired_at, expires_at
    ) VALUES (
        p_owner_user_id, p_workspace_id, guest.generation, token, now(),
        now() + interval '5 minutes'
    )
    RETURNING * INTO existing;

    RETURN json_build_object(
        'ok', true, 'replay', false,
        'fencing_token', existing.fencing_token,
        'generation', existing.generation,
        'expires_at', existing.expires_at
    );
END;
$$;

-- RPC: release a guest execution lease by fencing token.
CREATE OR REPLACE FUNCTION public.account_compute_release_guest_lease(
    p_owner_user_id   TEXT,
    p_workspace_id    TEXT,
    p_fencing_token   TEXT
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    lease record;
BEGIN
    SELECT * INTO lease FROM public.account_compute_guest_leases
     WHERE owner_user_id = p_owner_user_id
       AND workspace_id = p_workspace_id
       AND fencing_token = p_fencing_token
     FOR UPDATE;

    IF lease.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'lease not found');
    END IF;

    DELETE FROM public.account_compute_guest_leases
     WHERE id = lease.id;

    RETURN json_build_object('ok', true, 'generation', lease.generation);
END;
$$;

-- RPC: extend a guest execution lease expiry by p_extend_ms milliseconds.
CREATE OR REPLACE FUNCTION public.account_compute_extend_guest_lease(
    p_owner_user_id   TEXT,
    p_workspace_id    TEXT,
    p_fencing_token   TEXT,
    p_extend_ms       INTEGER
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    lease record;
BEGIN
    SELECT * INTO lease FROM public.account_compute_guest_leases
     WHERE owner_user_id = p_owner_user_id
       AND workspace_id = p_workspace_id
       AND fencing_token = p_fencing_token
     FOR UPDATE;

    IF lease.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'lease not found');
    END IF;

    UPDATE public.account_compute_guest_leases
       SET expires_at = lease.expires_at + (p_extend_ms || ' milliseconds')::interval
     WHERE id = lease.id;

    RETURN json_build_object('ok', true, 'expires_at',
        lease.expires_at + (p_extend_ms || ' milliseconds')::interval);
END;
$$;

-- RPC: transition a guest phase with generation CAS.
--   Valid phases: creating|running|suspending|suspended|error|destroyed.
CREATE OR REPLACE FUNCTION public.account_compute_mark_guest_phase(
    p_owner_user_id   TEXT,
    p_workspace_id    TEXT,
    p_expected_generation INTEGER,
    p_new_phase       TEXT
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    guest record;
BEGIN
    SELECT * INTO guest FROM public.account_compute_guests
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id
     FOR UPDATE;

    IF guest.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'guest not found');
    END IF;

    IF guest.generation <> p_expected_generation THEN
        RETURN json_build_object('ok', false, 'reason', 'stale generation',
            'expected', p_expected_generation, 'actual', guest.generation);
    END IF;

    UPDATE public.account_compute_guests
       SET phase = p_new_phase,
           generation = guest.generation + 1,
           quarantined = (p_new_phase = 'error')
     WHERE id = guest.id;

    RETURN json_build_object('ok', true, 'generation', guest.generation + 1,
        'phase', p_new_phase, 'quarantined', (p_new_phase = 'error'));
END;
$$;

-- RPC: account-wide ready -> suspending fence.
--   Prevents new guest leases while the VM is suspending.
CREATE OR REPLACE FUNCTION public.account_compute_suspend_account_vm(
    p_owner_user_id   TEXT,
    p_expected_generation INTEGER
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    vm record;
BEGIN
    SELECT * INTO vm FROM public.account_compute_vms
     WHERE owner_user_id = p_owner_user_id FOR UPDATE;

    IF vm.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'vm not found');
    END IF;

    IF vm.generation <> p_expected_generation THEN
        RETURN json_build_object('ok', false, 'reason', 'stale generation',
            'expected', p_expected_generation, 'actual', vm.generation);
    END IF;

    IF vm.state <> 'ready' THEN
        RETURN json_build_object('ok', false, 'reason', 'vm not ready',
            'actual_state', vm.state);
    END IF;

    UPDATE public.account_compute_vms
       SET state = 'suspending',
           generation = vm.generation + 1
     WHERE id = vm.id;

    RETURN json_build_object('ok', true, 'generation', vm.generation + 1,
        'state', 'suspending');
END;
$$;

-- RPC: resolve a guest provisioning outcome (uncertain|failed).
--   'uncertain' retains the row in error/quarantine for reconciliation.
--   'failed' records the failure and keeps it for manual cleanup.
CREATE OR REPLACE FUNCTION public.account_compute_resolve_guest_provisioning(
    p_owner_user_id   TEXT,
    p_workspace_id    TEXT,
    p_outcome         TEXT, -- 'uncertain' | 'failed'
    p_now             TIMESTAMPTZ
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    guest record;
BEGIN
    SELECT * INTO guest FROM public.account_compute_guests
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id
     FOR UPDATE;

    IF guest.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'guest not found');
    END IF;

    IF p_outcome = 'uncertain' THEN
        UPDATE public.account_compute_guests
           SET phase = 'error',
               generation = guest.generation + 1,
               quarantined = true,
               error_reason = 'provisioning outcome uncertain',
               updated_at = p_now
         WHERE id = guest.id;
        RETURN json_build_object('ok', true, 'phase', 'error',
            'generation', guest.generation + 1, 'quarantined', true);
    END IF;

    IF p_outcome = 'failed' THEN
        UPDATE public.account_compute_guests
           SET phase = 'error',
               generation = guest.generation + 1,
               quarantined = true,
               error_reason = 'provider operation failed',
               updated_at = p_now
         WHERE id = guest.id;
        RETURN json_build_object('ok', true, 'phase', 'error',
            'generation', guest.generation + 1, 'quarantined', true);
    END IF;

    RETURN json_build_object('ok', false, 'reason', 'unknown outcome ' || p_outcome);
END;
$$;

-- RLS: service_role owns all access; users can read their own guest records.
ALTER TABLE public.account_compute_guests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_compute_guests FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.account_compute_guests FROM authenticated;
GRANT SELECT ON TABLE public.account_compute_guests TO authenticated;
CREATE POLICY "users_read_own_guests" ON public.account_compute_guests
    FOR SELECT TO authenticated
    USING (owner_user_id = auth.uid()::text);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_compute_guests TO service_role;

ALTER TABLE public.account_compute_guest_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_compute_guest_leases FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.account_compute_guest_leases FROM authenticated;
GRANT SELECT ON TABLE public.account_compute_guest_leases TO authenticated;
CREATE POLICY "users_read_own_guest_leases" ON public.account_compute_guest_leases
    FOR SELECT TO authenticated
    USING (owner_user_id = auth.uid()::text);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_compute_guest_leases TO service_role;

-- RPC function execution: restrict to service_role only.
REVOKE EXECUTE ON FUNCTION public.account_compute_acquire_guest_lease(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_release_guest_lease(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_extend_guest_lease(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_mark_guest_phase(text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_suspend_account_vm(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_resolve_guest_provisioning(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.account_compute_acquire_guest_lease(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_release_guest_lease(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_extend_guest_lease(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_mark_guest_phase(text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_suspend_account_vm(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_resolve_guest_provisioning(text, text, text, timestamptz) TO service_role;

COMMIT;
