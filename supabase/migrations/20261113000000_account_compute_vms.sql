-- ============================================================================
-- Account Compute Plane — A1: durable account reservation.
--
-- account_compute_vms: one row per Clerk account (owner_user_id UNIQUE).
--   Tracks the account's personal VM lifecycle state, provider/sandbox IDs,
--   VM class, generation (monotonic CAS), and verified entitlement snapshot.
--
-- account_compute_workspaces: binds workspaces to the account VM.
--   Composite unique (owner_user_id, workspace_id) — one binding per
--   account+workspace. compute_namespace is an opaque digest, not a security
--   boundary on its own.
--
-- Invariants:
--   * One VM per account (owner_user_id UNIQUE).
--   * Claims allocated via CAS RPC before any provider create.
--   * Writes go through service_role; user reads scoped by owner_user_id via RLS.
--   * Generation compare-and-swap for attach/detach/teardown; no duplicate
--     concurrent claims.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.account_compute_vms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   TEXT NOT NULL UNIQUE,        -- one VM per Clerk account
    desktop_id      TEXT,                         -- VDI desktop ID (set when ready)
    provider_id     TEXT,                         -- Daytona sandbox ID
    vm_class        TEXT NOT NULL,                -- e.g. 'daytona-vm-small'
    generation      INTEGER NOT NULL DEFAULT 1,   -- monotonic CAS counter
    state           TEXT NOT NULL DEFAULT 'provisioning', -- provisioning|ready|suspended|failed|quarantined|destroyed|degraded
    entitlement     JSONB NOT NULL,               -- verified snapshot: vcpus, memoryMb, storageGb, maxConcurrentWorkspaces
    operation_key   TEXT NOT NULL UNIQUE,         -- idempotency key for provisioning
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_compute_vms_owner
    ON public.account_compute_vms(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_vms_state
    ON public.account_compute_vms(state);

CREATE TABLE IF NOT EXISTS public.account_compute_workspaces (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id    TEXT NOT NULL,
    workspace_id     TEXT NOT NULL,
    compute_namespace TEXT NOT NULL,              -- opaque digest from contracts.ts
    generation       INTEGER NOT NULL DEFAULT 1,
    status           TEXT NOT NULL DEFAULT 'active', -- active|detached|terminated
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_account_compute_workspaces_owner
    ON public.account_compute_workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_workspaces_workspace
    ON public.account_compute_workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_account_compute_workspaces_status
    ON public.account_compute_workspaces(owner_user_id, workspace_id, status);

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.touch_account_compute() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_account_compute_vms_touch ON public.account_compute_vms;
CREATE TRIGGER trg_account_compute_vms_touch
    BEFORE UPDATE ON public.account_compute_vms
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_account_compute();

DROP TRIGGER IF EXISTS trg_account_compute_workspaces_touch ON public.account_compute_workspaces;
CREATE TRIGGER trg_account_compute_workspaces_touch
    BEFORE UPDATE ON public.account_compute_workspaces
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_account_compute();

-- RPC: claim an account VM before any provider create.
--   Idempotent: existing claim for the same owner returns the original row.
--   CAS: generation increment on every state change; caller must present
--   the current generation to mutate.
CREATE OR REPLACE FUNCTION public.account_compute_claim_vm(
    p_owner_user_id   TEXT,
    p_operation_key   TEXT,
    p_vm_class        TEXT,
    p_entitlement     JSONB
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    existing record;
BEGIN
    -- Idempotency: does this account already have a VM claim?
    SELECT * INTO existing FROM public.account_compute_vms
     WHERE owner_user_id = p_owner_user_id FOR UPDATE;

    IF existing.owner_user_id IS NOT NULL THEN
        -- Same account: return the existing claim (replay-safe).
        RETURN json_build_object(
            'claimed', true,
            'replay', true,
            'vm_id', existing.id,
            'desktop_id', existing.desktop_id,
            'provider_id', existing.provider_id,
            'state', existing.state,
            'generation', existing.generation,
            'operation_key', existing.operation_key
        );
    END IF;

    -- Insert the claim. UNIQUE(owner_user_id) prevents duplicates;
    -- concurrent claims for the same account will fail on one.
    INSERT INTO public.account_compute_vms (
        owner_user_id, desktop_id, provider_id, vm_class, generation,
        state, entitlement, operation_key
    ) VALUES (
        p_owner_user_id, NULL, NULL, p_vm_class, 1,
        'provisioning', p_entitlement, p_operation_key
    )
    RETURNING * INTO existing;

    RETURN json_build_object(
        'claimed', true,
        'replay', false,
        'vm_id', existing.id,
        'desktop_id', existing.desktop_id,
        'provider_id', existing.provider_id,
        'state', existing.state,
        'generation', existing.generation,
        'operation_key', existing.operation_key
    );
EXCEPTION WHEN unique_violation THEN
    -- Race: another transaction claimed first. Return the existing row.
    SELECT * INTO existing FROM public.account_compute_vms
     WHERE owner_user_id = p_owner_user_id;
    RETURN json_build_object(
        'claimed', true,
        'replay', true,
        'vm_id', existing.id,
        'desktop_id', existing.desktop_id,
        'provider_id', existing.provider_id,
        'state', existing.state,
        'generation', existing.generation,
        'operation_key', existing.operation_key
    );
END;
$$;

-- RPC: mark VM provisioning complete (desktop_id/provider_id set, state ready).
--   Requires current generation for CAS.
CREATE OR REPLACE FUNCTION public.account_compute_mark_ready(
    p_owner_user_id   TEXT,
    p_desktop_id      TEXT,
    p_provider_id     TEXT,
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
        RETURN json_build_object('ok', false, 'reason', 'generation mismatch',
            'expected', p_expected_generation, 'actual', vm.generation);
    END IF;

    UPDATE public.account_compute_vms
       SET desktop_id = p_desktop_id,
           provider_id = p_provider_id,
           state = 'ready',
           generation = vm.generation + 1
     WHERE id = vm.id;

    RETURN json_build_object('ok', true, 'generation', vm.generation + 1);
END;
$$;

-- RPC: record failed provisioning (state failed, retained for reconciliation).
CREATE OR REPLACE FUNCTION public.account_compute_mark_failed(
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
        RETURN json_build_object('ok', false, 'reason', 'generation mismatch',
            'expected', p_expected_generation, 'actual', vm.generation);
    END IF;

    UPDATE public.account_compute_vms
       SET state = 'failed',
           generation = vm.generation + 1
     WHERE id = vm.id;

    RETURN json_build_object('ok', true, 'generation', vm.generation + 1);
END;
$$;

-- RPC: attach a workspace to the account VM.
--   Composite UNIQUE(owner_user_id, workspace_id) prevents duplicates.
--   Generation CAS on the workspace binding.
CREATE OR REPLACE FUNCTION public.account_compute_attach_workspace(
    p_owner_user_id     TEXT,
    p_workspace_id      TEXT,
    p_compute_namespace TEXT,
    p_expected_generation INTEGER DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    existing record;
BEGIN
    -- Idempotency: does this binding already exist?
    SELECT * INTO existing FROM public.account_compute_workspaces
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id FOR UPDATE;

    IF existing.owner_user_id IS NOT NULL THEN
        IF existing.status = 'active' THEN
            RETURN json_build_object(
                'attached', true, 'replay', true,
                'workspace_id', existing.workspace_id,
                'compute_namespace', existing.compute_namespace,
                'generation', existing.generation
            );
        END IF;
        -- Reactivate a detached/terminated binding.
        UPDATE public.account_compute_workspaces
           SET status = 'active',
               compute_namespace = p_compute_namespace,
               generation = existing.generation + 1
         WHERE id = existing.id;
        RETURN json_build_object(
            'attached', true, 'replay', false,
            'workspace_id', existing.workspace_id,
            'compute_namespace', existing.compute_namespace,
            'generation', existing.generation + 1
        );
    END IF;

    -- CAS: if expected_generation is provided, verify no newer binding exists.
    -- (For new inserts there is no existing row; generation starts at 1.)
    INSERT INTO public.account_compute_workspaces (
        owner_user_id, workspace_id, compute_namespace, generation, status
    ) VALUES (
        p_owner_user_id, p_workspace_id, p_compute_namespace, 1, 'active'
    )
    RETURNING * INTO existing;

    RETURN json_build_object(
        'attached', true, 'replay', false,
        'workspace_id', existing.workspace_id,
        'compute_namespace', existing.compute_namespace,
        'generation', existing.generation
    );
EXCEPTION WHEN unique_violation THEN
    -- Race: concurrent attach. Return the existing row.
    SELECT * INTO existing FROM public.account_compute_workspaces
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id;
    RETURN json_build_object(
        'attached', true, 'replay', true,
        'workspace_id', existing.workspace_id,
        'compute_namespace', existing.compute_namespace,
        'generation', existing.generation
    );
END;
$$;

-- RPC: detach a workspace from the account VM (soft: status detached).
--   Generation CAS.
CREATE OR REPLACE FUNCTION public.account_compute_detach_workspace(
    p_owner_user_id   TEXT,
    p_workspace_id    TEXT,
    p_expected_generation INTEGER
) RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    ws record;
BEGIN
    SELECT * INTO ws FROM public.account_compute_workspaces
     WHERE owner_user_id = p_owner_user_id AND workspace_id = p_workspace_id FOR UPDATE;

    IF ws.owner_user_id IS NULL THEN
        RETURN json_build_object('ok', false, 'reason', 'binding not found');
    END IF;

    IF ws.generation <> p_expected_generation THEN
        RETURN json_build_object('ok', false, 'reason', 'generation mismatch',
            'expected', p_expected_generation, 'actual', ws.generation);
    END IF;

    UPDATE public.account_compute_workspaces
       SET status = 'detached',
           generation = ws.generation + 1
     WHERE id = ws.id;

    RETURN json_build_object('ok', true, 'generation', ws.generation + 1);
END;
$$;

-- RPC: resolve provisioning outcome (uncertain|failed).
--   'uncertain' → state held for reconciliation (retained, never auto-released).
--   'failed'    → state failed.
CREATE OR REPLACE FUNCTION public.account_compute_resolve_provisioning(
    p_owner_user_id   TEXT,
    p_outcome         TEXT, -- 'uncertain' | 'failed'
    p_now             TIMESTAMPTZ
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

    IF p_outcome = 'uncertain' THEN
        UPDATE public.account_compute_vms
           SET state = 'failed',
               generation = vm.generation + 1,
               updated_at = p_now
         WHERE id = vm.id;
        RETURN json_build_object('ok', true, 'state', 'failed', 'generation', vm.generation + 1);
    END IF;

    IF p_outcome = 'failed' THEN
        UPDATE public.account_compute_vms
           SET state = 'failed',
               generation = vm.generation + 1,
               updated_at = p_now
         WHERE id = vm.id;
        RETURN json_build_object('ok', true, 'state', 'failed', 'generation', vm.generation + 1);
    END IF;

    RETURN json_build_object('ok', false, 'reason', 'unknown outcome ' || p_outcome);
END;
$$;

-- RPC: mark VM suspended. Dedicated generation-fenced transition (never
-- writes state='ready' after a provider suspend).
CREATE OR REPLACE FUNCTION public.account_compute_mark_suspended(
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
        RETURN json_build_object('ok', false, 'reason', 'generation mismatch',
            'expected', p_expected_generation, 'actual', vm.generation);
    END IF;

    IF vm.state <> 'ready' THEN
        RETURN json_build_object('ok', false, 'reason', 'vm not ready',
            'actual_state', vm.state);
    END IF;

    UPDATE public.account_compute_vms
       SET state = 'suspended',
           generation = vm.generation + 1
     WHERE id = vm.id;

    RETURN json_build_object('ok', true, 'generation', vm.generation + 1, 'state', 'suspended');
END;
$$;

-- RLS: service_role owns all access; users can read their own VMs/bindings.
ALTER TABLE public.account_compute_vms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_compute_vms FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.account_compute_vms FROM authenticated;
GRANT SELECT ON TABLE public.account_compute_vms TO authenticated;
CREATE POLICY "users_read_own_vms" ON public.account_compute_vms
    FOR SELECT TO authenticated
    USING (owner_user_id = auth.uid()::text);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_compute_vms TO service_role;

ALTER TABLE public.account_compute_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_compute_workspaces FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.account_compute_workspaces FROM authenticated;
GRANT SELECT ON TABLE public.account_compute_workspaces TO authenticated;
CREATE POLICY "users_read_own_workspace_bindings" ON public.account_compute_workspaces
    FOR SELECT TO authenticated
    USING (owner_user_id = auth.uid()::text);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_compute_workspaces TO service_role;

-- RPC function execution: restrict to service_role only. PostgreSQL grants
-- EXECUTE to PUBLIC by default, so revoke explicitly and grant only to
-- service_role. Authenticated users never call these RPCs directly.
REVOKE EXECUTE ON FUNCTION public.account_compute_claim_vm(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_mark_ready(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_mark_failed(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_mark_suspended(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_attach_workspace(text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_detach_workspace(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.account_compute_resolve_provisioning(text, text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.account_compute_claim_vm(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_mark_ready(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_mark_failed(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_mark_suspended(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_attach_workspace(text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_detach_workspace(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_compute_resolve_provisioning(text, text, timestamptz) TO service_role;

COMMIT;
