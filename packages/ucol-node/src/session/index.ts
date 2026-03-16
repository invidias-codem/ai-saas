/**
 * @file session/index.ts
 * @description Session lifecycle management — open, close, TTL enforcement.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  SessionOpenResponse,
  CloseResult,
  NodeCapability,
  SecurityTier,
  UUID,
  DID,
} from '../store/schema.js';
import type { ContextStore } from '../store/index.js';

/** Default session TTL: 1 hour */
const DEFAULT_TTL_SECONDS = 3600;

/** Required node capabilities — always granted */
const REQUIRED_CAPABILITIES: NodeCapability[] = ['ROUTING', 'MEMORY'];

/**
 * SessionManager — handles session open/close lifecycle with TTL enforcement.
 */
export class SessionManager {
  private readonly store: ContextStore;
  private readonly ttlSeconds: number;
  /** In-memory session cache for fast TTL checks */
  private readonly sessions: Map<UUID, Session> = new Map();

  /**
   * @param store - ContextStore for session persistence
   * @param ttlSeconds - Session TTL in seconds (default: 3600)
   */
  constructor(store: ContextStore, ttlSeconds: number = DEFAULT_TTL_SECONDS) {
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Open a new session for an agent.
   *
   * @param agentId - Agent DID
   * @param requestedCapabilities - Capabilities the agent is requesting
   * @param clearance - Agent's security clearance for this session
   * @returns SessionOpenResponse with session_id and granted capabilities
   */
  async open(
    agentId: DID,
    requestedCapabilities: NodeCapability[],
    clearance: SecurityTier
  ): Promise<SessionOpenResponse> {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    // Always grant ROUTING + MEMORY; add other requested capabilities
    const grantedSet = new Set<NodeCapability>([...REQUIRED_CAPABILITIES]);
    for (const cap of requestedCapabilities) {
      grantedSet.add(cap);
    }
    const grantedCapabilities: NodeCapability[] = [...grantedSet];

    const session: Session = {
      session_id: sessionId,
      agent_id: agentId,
      granted_capabilities: grantedCapabilities,
      security_clearance: clearance,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      h_bytes: 0,
      history_count: 0,
    };

    // Persist and cache
    await this.store.upsertSession(session);
    this.sessions.set(sessionId, session);

    return {
      session_id: sessionId,
      granted_capabilities: grantedCapabilities,
      expires_at: expiresAt.toISOString(),
      context_id: null,
    };
  }

  /**
   * Close a session and clean up state.
   * Triggers Engram distillation if history exceeds threshold.
   *
   * @param sessionId - Session UUID to close
   * @param distillationThresholdBytes - H threshold for Engram trigger (default: 50KB)
   * @returns CloseResult
   */
  async close(
    sessionId: UUID,
    distillationThresholdBytes: number = 51200
  ): Promise<CloseResult> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return { items_committed: 0, engram_triggered: false };
    }

    const hBytes = session.h_bytes;
    const engramTriggered = hBytes > distillationThresholdBytes;

    // Remove from cache and DB
    this.sessions.delete(sessionId);
    await this.store.deleteSession(sessionId);

    return {
      items_committed: session.history_count,
      engram_triggered: engramTriggered,
    };
  }

  /**
   * Get a session by ID, checking TTL.
   *
   * @param sessionId - Session UUID
   * @returns Session if valid and not expired, null otherwise
   */
  async getSession(sessionId: UUID): Promise<Session | null> {
    // Check memory cache first
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Fall back to DB
      session = (await this.store.getSession(sessionId)) ?? undefined;
      if (session) this.sessions.set(sessionId, session);
    }

    if (!session) return null;

    // Check TTL
    if (new Date() > new Date(session.expires_at)) {
      this.sessions.delete(sessionId);
      await this.store.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Validate that a session is active and has the required capability.
   *
   * @param sessionId - Session UUID
   * @param capability - Required capability
   * @returns true if valid and has capability
   */
  async hasCapability(sessionId: UUID, capability: NodeCapability): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;
    return session.granted_capabilities.includes(capability);
  }

  /**
   * Update session byte count after history writes.
   *
   * @param sessionId - Session UUID
   * @param additionalBytes - New bytes to add
   */
  async addHistoryBytes(sessionId: UUID, additionalBytes: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.h_bytes += additionalBytes;
    session.history_count += 1;
    this.sessions.set(sessionId, session);

    // Persist updated counts
    await this.store.upsertSession(session);
  }

  /**
   * Sweep expired sessions from the in-memory cache.
   * Call periodically (e.g., every 5 minutes).
   */
  sweepExpired(): number {
    const now = new Date();
    let swept = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (now > new Date(session.expires_at)) {
        this.sessions.delete(id);
        swept++;
      }
    }
    return swept;
  }

  /** Count of active in-memory sessions */
  get activeCount(): number {
    return this.sessions.size;
  }
}
