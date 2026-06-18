/**
 * GET /api/v1/docs — OpenAPI 3.0 spec for the Lattice OS Partner API.
 *
 * Partners can load this into Postman, Swagger UI, or auto-generate clients.
 * Example: https://editor.swagger.io/?url=https://lattice.app/api/v1/docs
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Lattice OS Partner API',
    description: 'Memory-native AI platform integration. Authenticate with your partner API key via Authorization: Bearer *** x-api-key header.',
    version: '1.0.0',
    contact: { name: 'Lattice OS', url: 'https://latticeos.ai/docs' },
  },
  servers: [
    { url: 'https://lattice.app', description: 'Production' },
    { url: 'http://localhost:3000', description: 'Local development' },
  ],
  paths: {
    '/api/v1/health': {
      get: {
        summary: 'Health check',
        description: 'Verify your API key and check gateway status.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Gateway healthy' },
          '401': { description: 'Invalid or missing API key' },
        },
      },
    },
    '/api/v1/memory': {
      post: {
        summary: 'Write a memory',
        description: 'Store a memory in your workspace. Requires memory:write scope.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', description: 'Memory content' },
                  type: { type: 'string', enum: ['fact', 'preference', 'code_chunk', 'conversation_summary'], default: 'fact' },
                  metadata: { type: 'object', description: 'Optional metadata' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Memory created', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, success: { type: 'boolean' } } } } } },
          '400': { description: 'Invalid request' },
          '403': { description: 'Insufficient scope' },
        },
      },
      get: {
        summary: 'List memories',
        description: 'Retrieve paginated memories from your workspace. Requires memory:read scope.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': { description: 'Memory list' },
          '403': { description: 'Insufficient scope' },
        },
      },
    },
    '/api/v1/query': {
      post: {
        summary: 'Semantic search',
        description: 'UCOL-powered context retrieval. Searches workspace memories by semantic similarity. Requires query:read scope.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', description: 'Natural language query' },
                  limit: { type: 'integer', default: 10, maximum: 50 },
                  include_scores: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Ranked results',
            content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object' } }, query: { type: 'string' }, total: { type: 'integer' } } } } },
          },
          '400': { description: 'Invalid request' },
          '403': { description: 'Insufficient scope' },
        },
      },
    },
    '/api/v1/stream': {
      post: {
        summary: 'Streaming semantic search',
        description: 'SSE event stream of query results. Ideal for agentic loops. Requires stream:read scope.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string' },
                  limit: { type: 'integer', default: 10, maximum: 50 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE stream',
            content: { 'text/event-stream': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/api/v1/webhooks': {
      post: {
        summary: 'Register a webhook',
        description: 'Subscribe to events. Returns signing secret ONCE. Requires webhooks:manage scope.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['endpoint_url'],
                properties: {
                  endpoint_url: { type: 'string', format: 'uri' },
                  events: { type: 'array', items: { type: 'string' } },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Webhook created with signing_secret' } },
      },
      get: {
        summary: 'List webhooks',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Webhook list' } },
      },
      delete: {
        summary: 'Deactivate a webhook',
        parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Webhook deactivated' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API Key', description: 'Your partner API key (lat_live_...  or lat_test_...)' },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Content-Type': 'application/json',
      'cache-control': 'public, max-age=300',
    },
  });
}
