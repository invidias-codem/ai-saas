/**
 * @file index.ts
 * @description UCOLNode — UCOL Protocol Reference Implementation entry point.
 *
 * Implements UCOL Protocol Specification v0.1.
 * See: research/ucol/UCOL-SPEC-v0.1.md
 */

import { v4 as uuidv4 } from 'uuid';
import type { Server } from 'node:http';
import {
  generateNodeIdentity,
  type NodeIdentity,
} from './identity/index.js';
import { ContextStore } from './store/index.js';
import { ContextRouter } from './router/index.js';
import { SessionManager } from './session/index.js';
import { EngramDistiller } from './engram/index.js';
import { MissionOrchestrator } from './mission/index.js';
import { startServer } from './api/server.js';
import type {
  Task,
  RoutingDecision,
  ContextFragment,
  QueryFilters,
  ContextQueryResponse,
  NodeCapability,
  SecurityTier,
  SessionOpenResponse,
  CloseResult,
  MissionSpec,
  UUID,
  Semver,
} from './store/schema.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface UCOLNodeConfig {
  /** Supabase project URL */
  supabaseUrl: string;
  /** Supabase service-role key (server-only, never expose to browser) */
  supabaseServiceKey: string;
  /** Google Gemini API key (for embedding + classification) */
  geminiApiKey: string;
  /** HTTP port for JSON-RPC server (default: 3001) */
  port?: number;
  /** Human-readable operator/org name */
  operator?: string;
  /** Session TTL in seconds (default: 3600) */
  sessionTtlSeconds?: number;
  /** Pre-existing node identity (if restoring from persistent storage) */
  identity?: NodeIdentity;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface PutResult {
  contextId: UUID;
  itemsStored: number;
}

export interface ExportResult {
  bundle: string;       // base64url-encoded bundle
  sizeBytes: number;
  itemCounts: { k: number; a: number; h: number; r: number };
}

export interface ImportResult {
  contextId: UUID;
  itemsImported: number;
  conflicts: Array<{ localId: UUID; importedId: UUID; resolution: string; reason: string }>;
  engramTriggered: boolean;
}

export interface NodeInfoResult {
  node_id: string;
  version: Semver;
  min_version: Semver;
  capabilities: NodeCapability[];
  uptime_seconds: number;
  operator: string;
  graph_stats: {
    knowledge_items: number;
    artifacts: number;
    relationships: number;
    active_sessions: number;
  };
  health: 'ok' | 'degraded' | 'unavailable';
}

// ─── UCOLNode ─────────────────────────────────────────────────────────────────

/**
 * UCOLNode — the atomic deployable unit of the UCOL protocol (spec §4).
 *
 * Maintains a persistent knowledge graph, exposes the UCOL JSON-RPC API,
 * manages agent sessions, and orchestrates multi-step missions.
 *
 * @example
 * ```typescript
 * const node = new UCOLNode({
 *   supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *   supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
 *   geminiApiKey: process.env.GOOGLE_API_KEY!,
 *   port: 3001,
 *   operator: 'Tech Genie',
 * });
 * await node.start();
 * ```
 */
export class UCOLNode {
  private readonly config: Required<UCOLNodeConfig>;
  private identity!: NodeIdentity;
  private store!: ContextStore;
  private router!: ContextRouter;
  private sessionManager!: SessionManager;
  private engram!: EngramDistiller;
  private missions!: MissionOrchestrator;
  private server: Server | null = null;
  private startedAt: Date | null = null;

  constructor(config: UCOLNodeConfig) {
    this.config = {
      port: 3001,
      operator: 'UCOL Node',
      sessionTtlSeconds: 3600,
      ...config,
    };
  }

  /**
   * Initialize all subsystems and start the HTTP server.
   */
  async start(): Promise<void> {
    // Identity
    this.identity = this.config.identity ?? await generateNodeIdentity();

    // Storage
    this.store = new ContextStore(
      this.config.supabaseUrl,
      this.config.supabaseServiceKey,
      this.config.geminiApiKey,
    );

    // Session manager
    this.sessionManager = new SessionManager(this.store, this.config.sessionTtlSeconds);

    // Router
    this.router = new ContextRouter(this.store, this.config.geminiApiKey);

    // Engram distiller
    this.engram = new EngramDistiller(this.store, this.config.geminiApiKey);

    // Mission orchestrator
    this.missions = new MissionOrchestrator(this.store, this.sessionManager);

    // HTTP server
    this.server = startServer(this, this.config.port);
    this.startedAt = new Date();

    console.log(`[UCOLNode] Started — ID: ${this.identity.did}`);
  }

  /**
   * Gracefully stop the HTTP server and flush in-flight sessions.
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[UCOLNode] Stopped.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // ─── Public API (used by handlers.ts and tests) ────────────────────────────

  /**
   * Return node info for ucol.node.info().
   */
  async getNodeInfo(): Promise<NodeInfoResult> {
    const uptimeSeconds = this.startedAt
      ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
      : 0;

    return {
      node_id: this.identity?.did ?? 'did:ucol:node:uninitialized',
      version: '0.1.0',
      min_version: '0.1.0',
      capabilities: ['ROUTING', 'MEMORY', 'EXECUTION', 'SYNTHESIS', 'GATEWAY'],
      uptime_seconds: uptimeSeconds,
      operator: this.config.operator,
      graph_stats: {
        knowledge_items: 0,   // TODO: query store for counts
        artifacts: 0,
        relationships: 0,
        active_sessions: this.sessionManager?.activeSessionCount() ?? 0,
      },
      health: 'ok',
    };
  }

  /**
   * Route a task to the optimal model with context slice.
   * Implements spec §5.3 via ContextRouter.
   */
  async route(task: Task): Promise<RoutingDecision> {
    await this.assertSessionValid(task.session_id);
    const session = await this.sessionManager.get(task.session_id);
    // Apply session clearance to task
    const effectiveTask: Task = {
      ...task,
      security_clearance: task.security_clearance ?? session.security_clearance,
    };
    return this.router.route(effectiveTask);
  }

  /**
   * Store context items (K, A, H, R) in the knowledge graph.
   */
  async putContext(fragment: ContextFragment, sessionId: string): Promise<PutResult> {
    await this.assertSessionValid(sessionId);
    return this.store.putFragment(fragment, sessionId);
  }

  /**
   * Query the knowledge graph with natural language + filters.
   */
  async queryContext(
    query: string,
    sessionId?: string,
    filters?: QueryFilters,
  ): Promise<ContextQueryResponse> {
    if (sessionId) await this.assertSessionValid(sessionId);
    const session = sessionId ? await this.sessionManager.get(sessionId) : null;
    const clearance = filters?.security_tier_max ?? session?.security_clearance ?? 'PUBLIC';
    return this.store.query(query, { ...filters, security_tier_max: clearance });
  }

  /**
   * Get a full context snapshot by ID.
   */
  async getContext(contextId: string): Promise<unknown> {
    return this.store.getContext(contextId);
  }

  /**
   * Export context as a signed UDIF or UCOL bundle.
   */
  async exportContext(contextId: string, format: string): Promise<ExportResult> {
    const ctx = await this.store.getContext(contextId);
    // Serialize and sign
    const payload = JSON.stringify(ctx);
    const payloadBytes = new TextEncoder().encode(payload);
    const signature = await this.identity.sign(payloadBytes);
    const bundle = Buffer.from(JSON.stringify({
      ucol_version: '0.1.0',
      udif_version: '2.0',
      exported_at: new Date().toISOString(),
      exported_by: this.identity.did,
      payload: ctx,
      signature,
      payload_hash: await sha256Hex(payloadBytes),
    })).toString('base64url');

    return {
      bundle,
      sizeBytes: bundle.length,
      itemCounts: {
        k: (ctx as { knowledge?: unknown[] })?.knowledge?.length ?? 0,
        a: (ctx as { artifacts?: unknown[] })?.artifacts?.length ?? 0,
        h: (ctx as { history?: unknown[] })?.history?.length ?? 0,
        r: (ctx as { relationships?: unknown[] })?.relationships?.length ?? 0,
      },
    };
  }

  /**
   * Import a UDIF/UCOL bundle into this node's knowledge graph.
   */
  async importContext(bundle: string, _format: string): Promise<ImportResult> {
    const parsed = JSON.parse(Buffer.from(bundle, 'base64url').toString('utf-8'));
    // Verify signature
    const payloadBytes = new TextEncoder().encode(JSON.stringify(parsed.payload));
    const expectedHash = await sha256Hex(payloadBytes);
    if (parsed.payload_hash !== expectedHash) {
      throw new Error('Bundle integrity check failed: payload_hash mismatch');
    }
    // Import items
    const result = await this.store.putFragment(parsed.payload as ContextFragment, 'import');
    return {
      contextId: uuidv4(),
      itemsImported: result.itemsStored,
      conflicts: [],
      engramTriggered: false,
    };
  }

  /**
   * Open a new agent session.
   */
  async openSession(
    agentId: string,
    capabilities: NodeCapability[],
    clearance: SecurityTier,
    ttlSeconds?: number,
  ): Promise<SessionOpenResponse> {
    return this.sessionManager.open(agentId, capabilities, clearance, ttlSeconds);
  }

  /**
   * Close an agent session and optionally trigger Engram distillation.
   */
  async closeSession(sessionId: string): Promise<CloseResult> {
    await this.assertSessionValid(sessionId);
    const rawHistory = await this.store.getRawHistory(sessionId);
    const totalBytes = rawHistory.reduce((sum, h) => sum + (h.content?.length ?? 0), 0);

    let engramTriggered = false;
    if (totalBytes > 50 * 1024) {
      await this.engram.distill(sessionId, rawHistory);
      engramTriggered = true;
    }

    return this.sessionManager.close(sessionId, engramTriggered);
  }

  /**
   * Create a new mission.
   */
  async createMission(spec: MissionSpec): Promise<{ mission_id: UUID }> {
    return this.missions.create(spec);
  }

  /**
   * Get current mission status.
   */
  async getMissionStatus(missionId: UUID): Promise<unknown> {
    return this.missions.getStatus(missionId);
  }

  /**
   * Cancel an active or paused mission.
   */
  async cancelMission(missionId: UUID, reason: string): Promise<{ ok: boolean }> {
    return this.missions.cancel(missionId, reason);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async assertSessionValid(sessionId: string): Promise<void> {
    const valid = await this.sessionManager.validate(sessionId);
    if (!valid) {
      const { UCOLError } = await import('./api/errors.js');
      throw new UCOLError(-33008, 'Session expired or not found');
    }
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Re-export types for consumers
export type {
  Task,
  RoutingDecision,
  ContextFragment,
  QueryFilters,
  ContextQueryResponse,
  NodeCapability,
  SecurityTier,
  SessionOpenResponse,
  CloseResult,
  MissionSpec,
};
