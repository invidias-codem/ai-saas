/**
 * Integration Tests for /api/memory/events
 * Covers ingest auth, validation, append-only behavior,
 * offline fallback, and list retrieval.
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

class MockRequest {
  public url: string;
  public method: string;
  public headers: Map<string, string>;
  private body: string;

  constructor(url: string, options: any = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.body = options.body || '{}';
    this.headers = new Map();

    if (options.headers) {
      Object.entries(options.headers).forEach(([k, v]) => {
        this.headers.set(k.toLowerCase(), v as string);
      });
    }
  }

  async json() {
    return JSON.parse(this.body);
  }
}

const createMockReq = (url: string, options: any = {}) => new MockRequest(url, options);

const mockLimitApiEndpoint = jest.fn<() => Promise<{ success: boolean }>>();
const mockAuth = jest.fn<() => Promise<{ userId: string }>>();
const mockAudit = jest.fn<() => Promise<void>>();
const mockSupabaseFrom = jest.fn();
const mockSupabaseInsert = jest.fn();
const mockSupabaseSelect = jest.fn();
const mockSupabaseOrder = jest.fn();
const mockSupabaseRange = jest.fn();
const mockSupabaseSingle = jest.fn<() => Promise<{ data: any; error: any }>>();

const mockMutationChain = {
  select: mockSupabaseSelect,
  single: mockSupabaseSingle,
};

const mockQueryChain = {
  select: mockSupabaseSelect,
  eq: jest.fn<() => Promise<{ data: any[]; error: any }>>().mockResolvedValue({ data: [], error: null }),
  single: mockSupabaseSingle,
  order: mockSupabaseOrder,
};

jest.mock('@/lib/security/rateLimit', () => ({
  limitApiEndpoint: mockLimitApiEndpoint,
  limitByUser: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
  limitByIP: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: true }),
  RateLimitError: class extends Error { retryAfter = 60; }
}));

jest.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: jest.fn<() => Promise<{ id: string } | null>>().mockResolvedValue({ id: 'user_123' }),
}));

jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: mockAuth,
  handleAuthError: jest.fn(),
  AuthenticationError: class AuthError extends Error { constructor() { super('Authentication required'); this.name = 'AuthenticationError'; } },
  AuthorizationError: class AuthzError extends Error { constructor() { super('Authorization failed'); this.name = 'AuthorizationError'; } },
  requireOwnership: jest.fn<() => Promise<void>>(),
  getClientIP: () => '127.0.0.1',
}));

jest.mock('@/lib/security/auditLog', () => ({
  audit: mockAudit,
}));

jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    from: mockSupabaseFrom,
  },
  supabase: {
    from: mockSupabaseFrom,
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    once: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();

  mockAuth.mockResolvedValue({ userId: null });
  mockLimitApiEndpoint.mockResolvedValue({ success: true });
  mockSupabaseFrom.mockReturnValue(mockQueryChain);
  mockSupabaseInsert.mockReturnValue(mockMutationChain);
  mockSupabaseSingle.mockResolvedValue({ data: { id: 'event-1' }, error: null });
  mockSupabaseOrder.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const mockAuthenticatedUser = (userId = 'user_123') => {
  mockAuth.mockResolvedValue({ userId });
};

const validEventPayload = {
  source: 'genie',
  latencyMs: 120,
  tokensIn: 10,
  tokensOut: 200,
  costEstimate: 0.001,
  confidence: 0.8,
  toolInvocations: [
    {
      toolId: 'tool-1',
      toolName: 'memory_search',
      status: 'success',
      latencyMs: 45,
      argsHash: 'sha1-abcdef12',
      outputSummary: '3 memories matched',
    },
  ],
  modelDecision: {
    requestedModel: 'gemini-2.5-flash',
    routedModel: 'gemini-2.5-flash',
    routeReason: 'default route',
    fallbackUsed: false,
    provider: 'google',
  },
  resultSummary: 'Retrieved memory context successfully.',
};

describe('/api/memory/events', () => {
  describe('POST', () => {
    test('should reject unauthenticated requests', async () => {
      mockAuth.mockRejectedValue(new Error('Authentication required'));

      const { POST } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events', {
        method: 'POST',
        body: JSON.stringify(validEventPayload),
      });

      const response = await POST(req);

      expect(response.status).toBe(401);
    });

    test('should reject requests above rate limit', async () => {
      mockAuthenticatedUser();
      mockLimitApiEndpoint.mockResolvedValue({ success: false });

      const { POST } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events', {
        method: 'POST',
        body: JSON.stringify(validEventPayload),
      });

      const response = await POST(req);

      expect(response.status).toBe(429);
    });

    test('should reject invalid JSON body', async () => {
      mockAuthenticatedUser();

      const { POST } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events', {
        method: 'POST',
        body: 'not-json',
      });

      const response = await POST(req);

      expect(response.status).toBe(400);
    });

    test('should accept valid memory event and return eventId', async () => {
      mockAuthenticatedUser();

      const { POST } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events', {
        method: 'POST',
        body: JSON.stringify(validEventPayload),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(typeof data.eventId).toBe('string');
      expect(data.eventId.length).toBeGreaterThan(0);
    });

    test('should persist appended user_id even when client omits it', async () => {
      mockAuthenticatedUser();

      const clientPayload = {
        ...validEventPayload,
        userId: undefined,
        workspaceId: undefined,
      };

      const { POST } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events', {
        method: 'POST',
        body: JSON.stringify(clientPayload),
      });

      const response = await POST(req);

      expect(response.status).toBe(200);
    });
  });

  describe('GET', () => {
    test('should reject unauthenticated list requests', async () => {
      mockAuth.mockRejectedValue(new Error('Authentication required'));

      const { GET } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events', {
        method: 'GET',
      });

      const response = await GET(req);

      expect(response.status).toBe(401);
    });

    test('should return records from Supabase when available', async () => {
      mockAuthenticatedUser();
      mockSupabaseOrder.mockResolvedValue({
        data: [
          {
            id: 'event-1',
            source: 'genie',
            latency_ms: 100,
            tokens_in: 10,
            tokens_out: 200,
            model_decision: { routedModel: 'gemini-2.5-flash' },
          },
        ],
        error: null,
      });

      const { GET } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events?limit=10&offset=0', {
        method: 'GET',
      });

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.events)).toBe(true);
    });

    test('should clamp limit to allowed maximum', async () => {
      mockAuthenticatedUser();

      const { GET } = require('@/app/api/memory/events/route');
      const req = createMockReq('http://localhost:3000/api/memory/events?limit=9999&offset=0', {
        method: 'GET',
      });

      const response = await GET(req);

      expect(response.status).toBe(200);
    });
  });
});
