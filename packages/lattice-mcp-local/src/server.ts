import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  licenseKeySchema,
  licensePayloadSchema,
  licenseTierSchema,
} from '@lattice-os/core';
import {
  DEFAULT_PORTS,
  MINIMUM_RESOURCES,
  DISK_THRESHOLDS,
  PREFLIGHT_STEPS,
} from '@lattice-os/core/constants';
import {
  runAllPreflight,
  type PreflightResult,
} from './preflight.js';

const SERVER_NAME = 'lattice-mcp-local';
const SERVER_VERSION = '0.1.0';

const TOOLS: Tool[] = [
  {
    name: 'preflight.run',
    description: 'Run Lattice OS host preflight checks (Docker, Compose, resources, ports, disk, auth).',
    inputSchema: {
      type: 'object',
      properties: {
        skip_auth: { type: 'boolean', description: 'Skip Docker Hub auth check (air-gapped installs)' },
        skip_ports: { type: 'boolean', description: 'Skip port availability check' },
        custom_ports: { type: 'array', items: { type: 'number' }, description: 'Override default ports to check' },
      },
    },
  },
  {
    name: 'license.validate_key',
    description: 'Validate a Lattice OS V3 license key string against format rules.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'License key (lattice-v3-...)' },
      },
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
  {
    name: 'env.validate',
    description: 'Validate a partial environment config against the Lattice OS env schema.',
    inputSchema: {
      type: 'object',
      properties: {
        values: {
          type: 'object',
          description: 'Environment key/value pairs (strings only). Example keys: DEPLOYMENT_MODE, NEXT_PUBLIC_SUPABASE_URL, GOOGLE_API_KEY',
        },
      },
      required: ['values'],
    },
  },
];

function parseMaybe(input: unknown): { ok: boolean; value: unknown; error: string | null } {
  try {
    const val = typeof input === 'string' ? JSON.parse(input) : input;
    return { ok: true, value: val, error: null };
  } catch (e: any) {
    return { ok: false, value: null, error: e?.message ?? 'Invalid JSON' };
  }
}

export function createServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'preflight.run': {
        const skipAuth = Boolean((args as any).skip_auth);
        const skipPorts = Boolean((args as any).skip_ports);
        const customPorts = Array.isArray((args as any).custom_ports)
          ? ((args as any).custom_ports as number[])
          : undefined;
        const results = runAllPreflight(skipAuth, skipPorts, customPorts);
        const summary = {
          checks: results,
          passed: results.every((r) => r.passed),
        };
        return {
          content: [
            { type: 'text', text: JSON.stringify(summary, null, 2) },
          ],
        };
      }

      case 'license.validate_key': {
        const key = String((args as any).key ?? '');
        const parseResult = licenseKeySchema.safeParse(key);
        if (!parseResult.success) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ valid: false, error: 'Invalid Lattice V3 license key format' }, null, 2) },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify({ valid: true, key: parseResult.data }, null, 2) },
          ],
        };
      }

      case 'license.validate_payload': {
        const payload = (args as any).payload;
        const parseResult = licensePayloadSchema.safeParse(payload);
        if (!parseResult.success) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ valid: false, issues: parseResult.error.issues }, null, 2) },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify({ valid: true, payload: parseResult.data }, null, 2) },
          ],
        };
      }

      case 'license.supported_tiers': {
        const tiers = licenseTierSchema.options;
        return {
          content: [
            { type: 'text', text: JSON.stringify({ supported_tiers: tiers }, null, 2) },
          ],
        };
      }

      case 'platform.constants': {
        // Dynamic import so the server can start without loading everything unconditionally
        const { DEFAULT_PORTS, MINIMUM_RESOURCES, DISK_THRESHOLDS, PREFLIGHT_STEPS } = await import('@lattice-os/core/constants');
        return {
          content: [
            { type: 'text', text: JSON.stringify({
              DEFAULT_PORTS,
              MINIMUM_RESOURCES,
              DISK_THRESHOLDS,
              PREFLIGHT_STEPS,
            }, null, 2) },
          ],
        };
      }

      case 'env.validate': {
        const values = (args as any).values ?? {};
        const envSchema = z.object({
          DEPLOYMENT_MODE: z.string().optional(),
          PREFLIGHT_SECRET: z.string().optional(),
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
          CLERK_SECRET_KEY: z.string().optional(),
          GOOGLE_API_KEY: z.string().optional(),
          NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
          NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
          SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
        });
        const parsed = envSchema.safeParse(values);
        if (!parsed.success) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ valid: false, issues: parsed.error.issues }, null, 2) },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify({ valid: true, env: parsed.data }, null, 2) },
          ],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  });

  return server;
}

export async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive for stdio
  await new Promise(() => {});
}
