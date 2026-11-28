// lib/code-builder/unifiedSession/contracts.ts
// Phase 8F.0: Unified session contract for AI–Human Workspace Runtime.
//
// One durable session identity associates preview sandboxes, VDI desktops,
// build tasks, and browser sessions with a single workspace and artifact
// revision. Control authority (who can issue interactive operations) is
// tracked separately from view access (observer mode).
//
// Trust boundary: every function validates workspace ownership and control
// generation before mutating state. Generation fencing prevents stale
// leases from acting after a handoff.

export type ControlMode = 'agent' | 'human' | 'observer' | 'handoff_pending';

export type ControlHolder = {
  readonly type: 'agent' | 'human';
  readonly id: string;
} | null;

export interface UnifiedSession {
  readonly id: string;
  readonly workspace_id: string;
  readonly build_id?: string | null;
  readonly preview_id?: string | null;
  readonly desktop_id?: string | null;
  readonly artifact_revision: string;
  readonly control_mode: ControlMode;
  readonly control_generation: number;
  readonly input_control: ControlHolder;
  readonly input_control_granted_at?: string | null;
  readonly input_control_expires_at?: string | null;
  readonly session_lease_user?: string | null;
  readonly session_lease_granted_at?: string | null;
  readonly session_lease_expires_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string;
}

export interface CreateSessionInput {
  readonly workspace_id: string;
  readonly artifact_revision: string;
  readonly build_id?: string;
  readonly preview_id?: string;
  readonly desktop_id?: string;
}

export interface AssociateResourceInput {
  readonly session_id: string;
  readonly resource_type: 'build' | 'preview' | 'desktop';
  readonly resource_id: string;
}

export interface GrantObserverInput {
  readonly session_id: string;
  readonly user_id: string;
  readonly ttl_ms?: number;
}

export interface GrantInputControlInput {
  readonly session_id: string;
  readonly holder_type: 'agent' | 'human';
  readonly holder_id: string;
  readonly ttl_ms?: number;
}

export interface TakeControlInput {
  readonly session_id: string;
  readonly human_user_id: string;
}

export interface HandBackInput {
  readonly session_id: string;
  readonly agent_id: string;
}

export interface SessionState {
  readonly session: UnifiedSession;
  readonly resources: {
    build_id?: string | null;
    preview_id?: string | null;
    desktop_id?: string | null;
  };
  readonly control: {
    readonly mode: ControlMode;
    readonly generation: number;
    readonly input_holder: ControlHolder;
    readonly observer_user?: string | null;
  };
  readonly canAct: {
    readonly agent: boolean;
    readonly human: boolean;
    readonly observer: boolean;
  };
}

export interface UnifiedSessionStore {
  createSession(input: CreateSessionInput): Promise<UnifiedSession>;
  getSession(sessionId: string): Promise<UnifiedSession | null>;
  getSessionState(sessionId: string): Promise<SessionState | null>;
  associateResource(input: AssociateResourceInput): Promise<void>;
  grantObserver(input: GrantObserverInput): Promise<void>;
  grantInputControl(input: GrantInputControlInput): Promise<void>;
  takeControl(input: TakeControlInput): Promise<void>;
  handBackToAI(input: HandBackInput): Promise<void>;
  revokeInputControl(sessionId: string): Promise<void>;
  revokeObserver(sessionId: string): Promise<void>;
  expireSession(sessionId: string): Promise<void>;
}
