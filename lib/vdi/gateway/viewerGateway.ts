// lib/vdi/gateway/viewerGateway.ts
// VDI-2B: the real viewer gateway — the security enforcement boundary.
//
// Contracts (VDI-2 closure):
//   1. Connections authenticate with a grant token; user/workspace scope is
//      derived SERVER-SIDE from the grant (never from client claims).
//   2. authorizeViewerInput runs before EVERY forwarded input event.
//      Denied input never reaches the desktop — the connection closes.
//   3. Idle connections close at grant expiry without waiting for input.
//   4. Revocation / membership loss / takeover is detected within
//      REVOCATION_MAX_DELAY_MS (sweep interval), then the connection closes.
//   5. Timers and subscriptions are removed on disconnect.

import { WebSocket, WebSocketServer } from 'ws';
import type { DurableDesktopBroker } from '@/lib/vdi/broker/desktopBroker';

/** Documented maximum delay for revocation detection (sweep interval). */
export const REVOCATION_MAX_DELAY_MS = 250;

export interface GatewayDeps {
  broker: DurableDesktopBroker;
  /** Transport to the desktop. Tests inject a recorder; production wires the provider stream. */
  forward: (desktopId: string, event: unknown, userId: string) => void;
  /** Grant token → server-derived identity. The broker grant row is the source. */
  resolveGrant: (grantToken: string) => Promise<{
    desktopId: string;
    userId: string;
    tenantId: string;
    workspaceId: string;
    protocol: string;
    expiresAt: string;
  } | null>;
  port: number;
  host?: string;
}

interface Conn {
  ws: WebSocket;
  userId: string;
  desktopId: string;
  tenantId: string;
  workspaceId: string;
  grantToken: string;
  expiryTimer: NodeJS.Timeout;
  closed: boolean;
}

export class ViewerGateway {
  private readonly wss: WebSocketServer;
  private readonly conns = new Set<Conn>();
  private readonly revocationSweep: NodeJS.Timeout;

  constructor(private readonly deps: GatewayDeps) {
    this.wss = new WebSocketServer({ port: deps.port, host: deps.host ?? '127.0.0.1' });
    this.wss.on('connection', ws => this.handleConnection(ws));

    // One sweep for ALL connections: revocation / membership loss / takeover
    // is caught within REVOCATION_MAX_DELAY_MS even if the client is idle.
    this.revocationSweep = setInterval(() => void this.sweep(), REVOCATION_MAX_DELAY_MS);
  }

  private handleConnection(ws: WebSocket): void {
    let conn: Conn | null = null;
    let authDeadline = setTimeout(() => {
      if (!conn) ws.close(4001, 'auth timeout');
    }, 5_000);

    ws.on('message', async raw => {
      if (!conn) {
        // ── 1. Authentication: identity derived server-side from the grant ──
        try {
          const msg = JSON.parse(String(raw));
          if (msg?.type !== 'auth' || typeof msg.grantToken !== 'string') {
            ws.close(4002, 'expected auth message');
            return;
          }
          const identity = await this.deps.resolveGrant(msg.grantToken);
          if (!identity) {
            ws.close(4003, 'invalid grant');
            return;
          }
          clearTimeout(authDeadline);
          authDeadline = undefined as unknown as NodeJS.Timeout;

          const scope = { tenantId: identity.tenantId, workspaceId: identity.workspaceId };
          const ok = await this.deps.broker.authorizeViewerInput(msg.grantToken, identity.userId, scope);
          if (!ok.allowed) {
            ws.close(4004, `unauthorized: ${ok.reason}`);
            return;
          }

          conn = {
            ws,
            userId: identity.userId,
            desktopId: identity.desktopId,
            tenantId: identity.tenantId,
            workspaceId: identity.workspaceId,
            grantToken: msg.grantToken,
            closed: false,
            // ── 3. Idle connections close at grant expiry, no input needed ──
            expiryTimer: setTimeout(() => {
              ws.close(4005, 'grant expired');
              if (conn) this.removeConn(conn);
            }, Math.max(0, new Date(identity.expiresAt).getTime() - Date.now())),
          };
          this.conns.add(conn);
          ws.send(JSON.stringify({ type: 'connected', protocol: identity.protocol }));
        } catch {
          ws.close(4002, 'malformed auth');
        }
        return;
      }

      // ── 2. EVERY input event passes authorizeViewerInput before forwarding ──
      const c = conn;
      const ok = await this.deps.broker.authorizeViewerInput(
        c.grantToken,
        c.userId,
        { tenantId: c.tenantId, workspaceId: c.workspaceId },
      );
      if (!ok.allowed) {
        // Denied input never reaches the desktop; connection closes.
        ws.close(4006, `revoked: ${ok.reason}`);
        this.removeConn(c);
        return;
      }
      this.deps.forward(c.desktopId, String(raw), c.userId);
    });

    ws.on('close', () => {
      // ── 5. Timers and state removed on disconnect ──
      if (authDeadline) clearTimeout(authDeadline);
      if (conn) this.removeConn(conn);
    });
  }

  /**
   * Periodic sweep (catches revocation/takeover even for idle clients):
   * re-authorize every live connection; close any that no longer pass.
   */
  private async sweep(): Promise<void> {
    const checks = [...this.conns].map(async c => {
      const ok = await this.deps.broker.authorizeViewerInput(
        c.grantToken,
        c.userId,
        { tenantId: c.tenantId, workspaceId: c.workspaceId },
      );
      if (!ok.allowed) {
        c.ws.close(4007, `swept: ${ok.reason}`);
        this.removeConn(c);
      }
    });
    await Promise.all(checks);
  }

  private removeConn(c: Conn): void {
    if (c.closed) return;
    c.closed = true;
    clearTimeout(c.expiryTimer);
    this.conns.delete(c);
  }

  /** Number of live authenticated connections. */
  get connectionCount(): number {
    return this.conns.size;
  }

  close(): Promise<void> {
    clearInterval(this.revocationSweep);
    for (const c of this.conns) {
      clearTimeout(c.expiryTimer);
      c.closed = true;
      c.ws.close(1000, 'gateway shutdown');
    }
    this.conns.clear();
    return new Promise(resolve => this.wss.close(() => resolve()));
  }
}
