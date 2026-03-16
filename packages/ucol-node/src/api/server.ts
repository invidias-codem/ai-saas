/**
 * @file api/server.ts
 * @description UCOL JSON-RPC 2.0 HTTP server (Hono).
 * Exposes all ucol.* methods over HTTP/2 with Ed25519 bearer auth.
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { UCOLHandlers } from './handlers.js';
import { authenticateRequest } from './auth.js';
import { UCOLError, UCOL_ERRORS } from './errors.js';
import type { UCOLNode } from '../index.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/**
 * Build a UCOL Hono app with all JSON-RPC handlers wired up.
 */
export function buildApp(node: UCOLNode): Hono {
  const app = new Hono();
  const handlers = new UCOLHandlers(node);

  // ── Health endpoint ─────────────────────────────────────────────────────────
  app.get('/health', async (c) => {
    return c.json({ status: 'ok', version: '0.1.0', timestamp: new Date().toISOString() });
  });

  // ── JSON-RPC 2.0 endpoint ───────────────────────────────────────────────────
  app.post('/', async (c) => {
    let body: JsonRpcRequest;

    try {
      body = await c.req.json<JsonRpcRequest>();
    } catch {
      return c.json<JsonRpcError>({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' },
      }, 400);
    }

    // Validate JSON-RPC envelope
    if (!body.jsonrpc || body.jsonrpc !== '2.0' || !body.method || !body.id) {
      return c.json<JsonRpcError>({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: { code: -32600, message: 'Invalid Request: missing jsonrpc, method, or id' },
      }, 400);
    }

    // Validate method format
    if (!body.method.startsWith('ucol.')) {
      return c.json<JsonRpcError>({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32601, message: `Method not found: ${body.method}` },
      }, 404);
    }

    // Authenticate (skip for ucol.node.info and ucol.node.health)
    const publicMethods = ['ucol.node.info', 'ucol.node.health'];
    if (!publicMethods.includes(body.method)) {
      const authResult = await authenticateRequest(c.req.header('Authorization') ?? '');
      if (!authResult.valid) {
        return c.json<JsonRpcError>({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -33001, message: 'Authentication failed: ' + authResult.reason },
        }, 401);
      }
    }

    // Dispatch to handler
    try {
      const result = await handlers.dispatch(body.method, body.params ?? {});
      return c.json<JsonRpcSuccess>({ jsonrpc: '2.0', id: body.id, result });
    } catch (err) {
      if (err instanceof UCOLError) {
        return c.json<JsonRpcError>({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: err.code, message: err.message, data: err.data },
        });
      }
      // Unknown error
      console.error('[UCOLServer] Unhandled error:', err);
      return c.json<JsonRpcError>({
        jsonrpc: '2.0',
        id: body.id,
        error: { code: -32603, message: 'Internal error' },
      }, 500);
    }
  });

  return app;
}

/**
 * Start the UCOL HTTP server on the given port.
 * Returns the underlying Node http.Server for graceful shutdown.
 */
export function startServer(node: UCOLNode, port: number = 3001): Server {
  const app = buildApp(node);
  const server = serve({ fetch: app.fetch, port }, () => {
    console.log(`[UCOLNode] JSON-RPC server listening on http://localhost:${port}`);
  });
  return server as unknown as Server;
}
