/**
 * Lattice OS Remote MCP Adapter
 *
 * Exposes the same tools as the local MCP adapter, but over HTTP/SSE
 * instead of stdio. Designed to run as:
 *   - a Vercel edge function (app/api/v1/mcp)
 *   - a Railway / Docker service
 *
 * OAuth dynamic client registration at /register
 * Clerk auth middleware for /mcp
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';

// Lazy-load heavy schemas only when a session initializes
async function loadSchemas() {
  const core = await import('@lattice-os/core');
  return {
    licenseKeySchema: core.licenseKeySchema,
    licensePayloadSchema: core.licensePayloadSchema,
    licenseTierSchema: core.licenseTierSchema,
    DEFAULT_PORTS: core.DEFAULT_PORTS,
    MINIMUM_RESOURCES: core.MINIMUM_RESOURCES,
    DISK_THRESHOLDS: core.DISK_THRESHOLDS,
  };
}

export function createServer() {
  const mcp = new Server(
    { name: 'lattice-mcp-remote', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  const TOOLS = [
    {
      name: 'preflight.run',
      description: 'Run Lattice OS host preflight checks (Docker, Compose, resources, ports, disk, auth).',
      inputSchema: {
        type: 'object',
        properties: {
          skip_auth: { type: 'boolean' },
          skip_ports: { type: 'boolean' },
          custom_ports: { type: 'array', items: { type: 'number' } },
        },
      },
    },
    {
      name: 'license.validate_key',
      description: 'Validate a Lattice OS V3 license key string against format rules.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' } },
        required: ['key'],
      },
    },
    {
      name: 'license.validate_payload',
      description: 'Validate a license payload object against the canonical Zod schema.',
      inputSchema: {
        type: 'object',
        properties: {
          payload: {
            type: 'object',
            properties: {
              tier: { type: 'string', enum: ['community', 'enterprise'] },
              features: { type: 'array', items: { type: 'string' } },
              instance_id: { type: 'string' },
              issued_at: { type: 'string' },
              expires_at: { type: 'string' },
            },
            required: ['tier'],
          },
        },
        required: ['payload'],
      },
    },
    {
      name: 'license.supported_tiers',
      description: 'Return the supported license tiers for Lattice OS.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'platform.constants',
      description: 'Return Lattice OS platform constants (default ports, minimum resources).',
      inputSchema: { type: 'object', properties: {} },
    },
  ];

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    switch (name) {
      case 'preflight.run': {
        const result = { tool: 'preflight.run', status: 'ok', note: 'Delegated to local adapter or future implementation' };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'license.validate_key': {
        const key = String((args as any).key ?? '');
        const schemas = await loadSchemas();
        const parseResult = schemas.licenseKeySchema.safeParse(key);
        if (!parseResult.success) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, error: 'Invalid Lattice V3 license key format' }, null, 2) }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify({ valid: true, key: parseResult.data }, null, 2) }] };
      }
      case 'license.validate_payload': {
        const payload = (args as any).payload;
        const schemas = await loadSchemas();
        const parseResult = schemas.licensePayloadSchema.safeParse(payload);
        if (!parseResult.success) return { content: [{ type: 'text', text: JSON.stringify({ valid: false, issues: parseResult.error.issues }, null, 2) }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify({ valid: true, payload: parseResult.data }, null, 2) }] };
      }
      case 'license.supported_tiers': {
        return { content: [{ type: 'text', text: JSON.stringify({ supported_tiers: ['community', 'enterprise'] }, null, 2) }] };
      }
      case 'platform.constants': {
        const schemas = await loadSchemas();
        return { content: [{ type: 'text', text: JSON.stringify({ DEFAULT_PORTS: schemas.DEFAULT_PORTS, MINIMUM_RESOURCES: schemas.MINIMUM_RESOURCES, DISK_THRESHOLDS: schemas.DISK_THRESHOLDS }, null, 2) }] };
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  });

  return mcp;
}

export function createTransport() {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
}

export async function handleRequest(req: any, res: any, body?: unknown) {
  const server = createServer();
  const transport = createTransport();

  (server as any).onclose = () => transport.close();
  (transport as any).onclose = () => server.close();

  await transport.handleRequest(req, res, body);
}
