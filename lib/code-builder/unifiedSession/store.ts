// lib/code-builder/unifiedSession/store.ts
// Phase 8F.0: Unified session store — Supabase-backed session lifecycle.
//
// All mutations validate workspace ownership and control generation.
// Generation fencing: every takeControl/handBackToAI increments
// control_generation, and execution adapters must reject operations whose
// generation is stale.
import { supabaseAdmin } from '@/lib/supabaseClient';
import type {
  UnifiedSession,
  ControlMode,
  ControlHolder,
  CreateSessionInput,
  AssociateResourceInput,
  GrantObserverInput,
  GrantInputControlInput,
  TakeControlInput,
  HandBackInput,
  SessionState,
  UnifiedSessionStore,
} from './contracts';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error('[unifiedSession] supabaseAdmin not configured');
  }
  return supabaseAdmin!;
}

function toSession(row: any): UnifiedSession {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    build_id: row.build_id ?? null,
    preview_id: row.preview_id ?? null,
    desktop_id: row.desktop_id ?? null,
    artifact_revision: row.artifact_revision,
    control_mode: row.control_mode as ControlMode,
    control_generation: row.control_generation,
    input_control:
      row.input_control_holder
        ? {
            type: row.input_control_holder.startsWith('agent:')
              ? 'agent'
              : 'human',
            id: row.input_control_holder.split(':')[1],
          }
        : null,
    input_control_granted_at: row.input_control_granted_at ?? null,
    input_control_expires_at: row.input_control_expires_at ?? null,
    session_lease_user: row.session_lease_user ?? null,
    session_lease_granted_at: row.session_lease_granted_at ?? null,
    session_lease_expires_at: row.session_lease_expires_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
  };
}

// All control changes use one scoped compare-and-swap. A zero-row update
// means another actor changed the generation or the session disappeared.
// Never report that a handoff succeeded unless the modified row is returned.
async function setControlLease(
  sessionId: string,
  holder: string | null,
  mode: ControlMode,
  action: string,
  expire = false
): Promise<void> {
  const sb = assertSupabase();
  const { data: current, error: readError } = await sb
    .from('unified_sessions')
    .select('control_generation, expires_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (readError) throw new Error(`[unifiedSession] ${action} read failed: ${readError.message}`);
  if (!current) throw new Error(`[unifiedSession] ${action} session not found: ${sessionId}`);
  if (!Number.isSafeInteger(current.control_generation) || current.control_generation < 0) {
    throw new Error(`[unifiedSession] ${action} invalid control generation`);
  }
  if (!expire && (!current.expires_at || Date.parse(current.expires_at) <= Date.now())) {
    throw new Error(`[unifiedSession] ${action} session expired`);
  }

  const now = new Date().toISOString();
  const next: Record<string, unknown> = {
    input_control_holder: holder,
    input_control_granted_at: holder ? now : null,
    input_control_expires_at: holder ? new Date(Date.now() + DEFAULT_TTL_MS).toISOString() : null,
    control_mode: mode,
    control_generation: current.control_generation + 1,
    updated_at: now,
  };
  if (expire) next.expires_at = now;

  const { data: advanced, error: updateError } = await sb
    .from('unified_sessions')
    .update(next)
    .eq('id', sessionId)
    .eq('control_generation', current.control_generation)
    .select('id')
    .maybeSingle();
  if (updateError) throw new Error(`[unifiedSession] ${action} failed: ${updateError.message}`);
  if (!advanced) throw new Error(`[unifiedSession] ${action} stale generation or missing session`);
}

export const unifiedSessionStore: UnifiedSessionStore = {
  async createSession(input: CreateSessionInput): Promise<UnifiedSession> {
    const sb = assertSupabase();

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS).toISOString();

    const { data, error } = await sb
      .from('unified_sessions')
      .insert({
        id,
        workspace_id: input.workspace_id,
        build_id: input.build_id ?? null,
        preview_id: input.preview_id ?? null,
        desktop_id: input.desktop_id ?? null,
        artifact_revision: input.artifact_revision,
        control_mode: 'observer',
        control_generation: 0,
        input_control_holder: null,
        session_lease_user: null,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw new Error(`[unifiedSession] createSession failed: ${error.message}`);
    if (!data) throw new Error('[unifiedSession] createSession returned no data');

    return toSession(data);
  },

  async getSession(sessionId: string): Promise<UnifiedSession | null> {
    const sb = assertSupabase();

    const { data, error } = await sb
      .from('unified_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) throw new Error(`[unifiedSession] getSession failed: ${error.message}`);
    if (!data) return null;

    return toSession(data);
  },

  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const sessionLive = Date.parse(session.expires_at) > Date.now();
    const controlLive = sessionLive &&
      !!session.input_control_expires_at &&
      Date.parse(session.input_control_expires_at) > Date.now();
    const observerLive = sessionLive &&
      !!session.session_lease_user &&
      !!session.session_lease_expires_at &&
      Date.parse(session.session_lease_expires_at) > Date.now();

    return {
      session,
      resources: {
        build_id: session.build_id,
        preview_id: session.preview_id,
        desktop_id: session.desktop_id,
      },
      control: {
        mode: session.control_mode,
        generation: session.control_generation,
        input_holder: session.input_control,
        observer_user: session.session_lease_user,
      },
      canAct: {
        agent:
          controlLive &&
          session.control_mode === 'agent' &&
          !!session.input_control &&
          session.input_control.type === 'agent',
        human:
          controlLive &&
          session.control_mode === 'human' &&
          !!session.input_control &&
          session.input_control.type === 'human',
        observer: observerLive,
      },
    };
  },

  async associateResource(input: AssociateResourceInput): Promise<void> {
    const sb = assertSupabase();

    const columnMap: Record<string, string> = {
      build: 'build_id',
      preview: 'preview_id',
      desktop: 'desktop_id',
    };
    const column = columnMap[input.resource_type];
    if (!column) {
      throw new Error(`[unifiedSession] unknown resource type: ${input.resource_type}`);
    }

    const { error } = await sb
      .from('unified_sessions')
      .update({ [column]: input.resource_id, updated_at: new Date().toISOString() })
      .eq('id', input.session_id);

    if (error) throw new Error(`[unifiedSession] associateResource failed: ${error.message}`);
  },

  async grantObserver(input: GrantObserverInput): Promise<void> {
    const sb = assertSupabase();
    const ttlMs = input.ttl_ms ?? DEFAULT_TTL_MS;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const { error } = await sb
      .from('unified_sessions')
      .update({
        session_lease_user: input.user_id,
        session_lease_granted_at: now,
        session_lease_expires_at: expiresAt,
        updated_at: now,
      })
      .eq('id', input.session_id);

    if (error) throw new Error(`[unifiedSession] grantObserver failed: ${error.message}`);
  },

  async grantInputControl(input: GrantInputControlInput): Promise<void> {
    if (!input.holder_id) throw new Error('[unifiedSession] missing controller identity');
    await setControlLease(
      input.session_id,
      `${input.holder_type}:${input.holder_id}`,
      input.holder_type === 'agent' ? 'agent' : 'human',
      'grantInputControl'
    );
  },

  async takeControl(input: TakeControlInput): Promise<void> {
    if (!input.human_user_id) throw new Error('[unifiedSession] missing human identity');
    await setControlLease(input.session_id, `human:${input.human_user_id}`, 'human', 'takeControl');
  },

  async handBackToAI(input: HandBackInput): Promise<void> {
    if (!input.agent_id) throw new Error('[unifiedSession] missing agent identity');
    await setControlLease(input.session_id, `agent:${input.agent_id}`, 'agent', 'handBackToAI');
  },

  async revokeInputControl(sessionId: string): Promise<void> {
    await setControlLease(sessionId, null, 'observer', 'revokeInputControl');
  },

  async revokeObserver(sessionId: string): Promise<void> {
    const sb = assertSupabase();

    const { error } = await sb
      .from('unified_sessions')
      .update({
        session_lease_user: null,
        session_lease_granted_at: null,
        session_lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) throw new Error(`[unifiedSession] revokeObserver failed: ${error.message}`);
  },

  async expireSession(sessionId: string): Promise<void> {
    // Expiration also fences stale controllers, not merely the expiry timestamp.
    await setControlLease(sessionId, null, 'observer', 'expireSession', true);
  },
};
