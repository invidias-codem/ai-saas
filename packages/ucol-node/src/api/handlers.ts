/**
 * @file api/handlers.ts
 * @description All ucol.* JSON-RPC method handlers.
 * Thin dispatch layer — real logic lives in UCOLNode.
 */

import { UCOLError, UCOL_ERRORS } from './errors.js';
import type { UCOLNode } from '../index.js';
import type {
  Task,
  ContextFragment,
  QueryFilters,
  NodeCapability,
  SecurityTier,
  MissionSpec,
} from '../store/schema.js';

/**
 * Handler registry for all ucol.* methods.
 */
export class UCOLHandlers {
  constructor(private readonly node: UCOLNode) {}

  /**
   * Dispatch a JSON-RPC method call to the appropriate handler.
   */
  async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      // ── Node ─────────────────────────────────────────────────────────────────
      case 'ucol.node.info':    return this.nodeInfo();
      case 'ucol.node.health':  return this.nodeHealth();

      // ── Context ──────────────────────────────────────────────────────────────
      case 'ucol.context.get':    return this.contextGet(params);
      case 'ucol.context.put':    return this.contextPut(params);
      case 'ucol.context.query':  return this.contextQuery(params);
      case 'ucol.context.export': return this.contextExport(params);
      case 'ucol.context.import': return this.contextImport(params);

      // ── Routing ──────────────────────────────────────────────────────────────
      case 'ucol.route': return this.route(params);

      // ── Sessions ─────────────────────────────────────────────────────────────
      case 'ucol.session.open':  return this.sessionOpen(params);
      case 'ucol.session.close': return this.sessionClose(params);

      // ── Missions ─────────────────────────────────────────────────────────────
      case 'ucol.mission.create': return this.missionCreate(params);
      case 'ucol.mission.status': return this.missionStatus(params);
      case 'ucol.mission.cancel': return this.missionCancel(params);

      // ── Federation ───────────────────────────────────────────────────────────
      case 'ucol.peer.register': return this.peerRegister(params);
      case 'ucol.peer.sync':     return this.peerSync(params);

      default:
        throw new UCOLError(-32601, `Method not found: ${method}`);
    }
  }

  // ── Node handlers ───────────────────────────────────────────────────────────

  private async nodeInfo(): Promise<unknown> {
    return this.node.getNodeInfo();
  }

  private async nodeHealth(): Promise<unknown> {
    return { status: 'ok', version: '0.1.0', checks: [] };
  }

  // ── Context handlers ────────────────────────────────────────────────────────

  private async contextGet(params: Record<string, unknown>): Promise<unknown> {
    const { context_id } = params;
    if (typeof context_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: context_id required');
    }
    return this.node.getContext(context_id);
  }

  private async contextPut(params: Record<string, unknown>): Promise<unknown> {
    const { fragment, session_id } = params;
    if (!fragment || typeof session_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: fragment and session_id required');
    }
    return this.node.putContext(fragment as ContextFragment, session_id);
  }

  private async contextQuery(params: Record<string, unknown>): Promise<unknown> {
    const { query, session_id, filters } = params;
    if (typeof query !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: query string required');
    }
    return this.node.queryContext(query, session_id as string | undefined, filters as QueryFilters | undefined);
  }

  private async contextExport(params: Record<string, unknown>): Promise<unknown> {
    const { context_id, format } = params;
    if (typeof context_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: context_id required');
    }
    return this.node.exportContext(context_id, (format as string) ?? 'ucol');
  }

  private async contextImport(params: Record<string, unknown>): Promise<unknown> {
    const { bundle, format } = params;
    if (typeof bundle !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: bundle (base64url) required');
    }
    return this.node.importContext(bundle, (format as string) ?? 'ucol');
  }

  // ── Routing handler ─────────────────────────────────────────────────────────

  private async route(params: Record<string, unknown>): Promise<unknown> {
    if (!isTask(params)) {
      throw new UCOLError(-32602, 'Invalid params: query, agent_id, session_id required as strings');
    }
    return this.node.route(params);
  }

  // ── Session handlers ────────────────────────────────────────────────────────

  private async sessionOpen(params: Record<string, unknown>): Promise<unknown> {
    const { agent_id, capabilities_requested, security_clearance, ttl_seconds } = params;
    if (typeof agent_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: agent_id required');
    }
    return this.node.openSession(
      agent_id,
      (capabilities_requested as NodeCapability[]) ?? ['ROUTING', 'MEMORY'],
      (security_clearance as SecurityTier) ?? 'INTERNAL',
      typeof ttl_seconds === 'number' ? ttl_seconds : 3600,
    );
  }

  private async sessionClose(params: Record<string, unknown>): Promise<unknown> {
    const { session_id } = params;
    if (typeof session_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: session_id required');
    }
    return this.node.closeSession(session_id);
  }

  // ── Mission handlers ────────────────────────────────────────────────────────

  private async missionCreate(params: Record<string, unknown>): Promise<unknown> {
    if (!isMissionSpec(params)) {
      throw new UCOLError(-32602, 'Invalid params: goal (string), steps (array), agents (array), timeout_ms (number) required');
    }
    return this.node.createMission(params);
  }

  private async missionStatus(params: Record<string, unknown>): Promise<unknown> {
    const { mission_id } = params;
    if (typeof mission_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: mission_id required');
    }
    return this.node.getMissionStatus(mission_id);
  }

  private async missionCancel(params: Record<string, unknown>): Promise<unknown> {
    const { mission_id, reason } = params;
    if (typeof mission_id !== 'string') {
      throw new UCOLError(-32602, 'Invalid params: mission_id required');
    }
    return this.node.cancelMission(mission_id, (reason as string) ?? 'Cancelled by operator');
  }

  // ── Federation handlers ─────────────────────────────────────────────────────

  private async peerRegister(params: Record<string, unknown>): Promise<unknown> {
    throw new UCOLError(-32601, 'Federation not yet implemented in this node instance');
  }

  private async peerSync(params: Record<string, unknown>): Promise<unknown> {
    throw new UCOLError(-32601, 'Federation not yet implemented in this node instance');
  }
}
