/**
 * Integration Tests for Secured API Endpoints
 * Tests authentication, rate limiting, ownership validation, and input validation
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock Request class to simulate NextRequest behavior in Node/Jest environment
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

// Helper to mocked headers interface matched by NextRequest
const createMockReq = (url: string, options: any = {}) => {
    return new MockRequest(url, options);
};

// Define global mocks setup with explicit types
const mockLimitApiEndpoint = jest.fn<() => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>>();

// Clerk Mocks
const mockAuth = jest.fn<() => Promise<{ userId: string | null }>>();
const mockCurrentUser = jest.fn<() => Promise<{ id: string } | null>>();

// Query Chain Mocks
const mockQuerySelect = jest.fn();
const mockQueryEq = jest.fn();
const mockQuerySingle = jest.fn<() => Promise<{ data: any; error: any }>>();

// Mutation Chain Mocks
const mockMutationSelect = jest.fn();
const mockMutationSingle = jest.fn<() => Promise<{ data: any; error: any }>>();
const mockSupabaseInsert = jest.fn();
const mockSupabaseUpdate = jest.fn();
const mockSupabaseDelete = jest.fn();

// Top Level Mocks
const mockSupabaseFrom = jest.fn();

// Chain Objects
const mockMutationChain = {
    select: mockMutationSelect,
    single: mockMutationSingle,
    order: jest.fn<() => Promise<{ data: any[]; error: any }>>().mockResolvedValue({ data: [], error: null })
};

const mockQueryChain = {
    select: mockQuerySelect,
    eq: mockQueryEq,
    single: mockQuerySingle,
    insert: mockSupabaseInsert,
    update: mockSupabaseUpdate,
    delete: mockSupabaseDelete,
    order: jest.fn<() => Promise<{ data: any[]; error: any }>>().mockResolvedValue({ data: [], error: null })
};

// Mock dependencies
// REPLACE: Old Upstash mock with direct lib mock
jest.mock('@vercel/analytics/server', () => ({
    track: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

jest.mock('@/lib/analytics/track', () => ({
    trackAIGeneration: jest.fn<() => Promise<void>>().mockResolvedValue(),
    trackAIError: jest.fn<() => Promise<void>>().mockResolvedValue(),
    trackCreditsDeducted: jest.fn<() => Promise<void>>().mockResolvedValue(),
    trackReferral: jest.fn<() => Promise<void>>().mockResolvedValue(),
    trackFeatureToggle: jest.fn<() => Promise<void>>().mockResolvedValue(),
}));

jest.mock('@/lib/security/rateLimit', () => ({
    limitApiEndpoint: mockLimitApiEndpoint,
    limitByUser: jest.fn<() => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>>().mockResolvedValue({ success: true, limit: 100, remaining: 100, reset: 0 }),
    limitByIP: jest.fn<() => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>>().mockResolvedValue({ success: true, limit: 100, remaining: 100, reset: 0 }),
    // Mock the error class if used, though usually simple Error is enough for mocks
    RateLimitError: class extends Error { retryAfter = 60; }
}));

// Mock Clerk
jest.mock('@clerk/nextjs/server', () => ({
    auth: mockAuth,
    currentUser: mockCurrentUser
}));

const mockSupabase = {
    from: mockSupabaseFrom,
};

jest.mock('@/lib/supabaseClient', () => ({
    supabase: mockSupabase,
    supabaseAdmin: mockSupabase
}));

describe('API Security - Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();

        // Default: Unauthenticated
        mockAuth.mockResolvedValue({ userId: null });
        mockCurrentUser.mockResolvedValue(null);

        // Default: Rate limit allowed
        mockLimitApiEndpoint.mockResolvedValue({
            success: true,
            reset: Date.now() + 60000,
            remaining: 10,
            limit: 10
        });

        // Setup Chain references
        mockSupabaseFrom.mockReturnValue(mockQueryChain);

        // Query Chain Defaults - returns self for fluent API
        mockQuerySelect.mockReturnValue(mockQueryChain);
        mockQueryEq.mockReturnValue(mockQueryChain);
        mockQuerySingle.mockResolvedValue({ data: null, error: null });

        // Mutation Chain Defaults
        mockSupabaseInsert.mockReturnValue(mockMutationChain);
        mockSupabaseUpdate.mockReturnValue(mockMutationChain);
        mockSupabaseDelete.mockReturnValue(mockMutationChain);

        mockMutationSelect.mockReturnValue(mockMutationChain);
        mockMutationSingle.mockResolvedValue({ data: null, error: null });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Helper to auth properly for a test
    const mockAuthenticatedUser = (userId: string = 'user_123') => {
        mockAuth.mockResolvedValue({ userId });
        mockCurrentUser.mockResolvedValue({ id: userId });
    };

    describe('/api/chat - Chat Endpoint', () => {
        test('should reject unauthenticated requests', async () => {
            const req = createMockReq('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: 'Hello' })
            });

            const { POST } = require('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toContain('Unauthorized');
        });

        test('should reject requests with invalid prompt', async () => {
            mockAuthenticatedUser();

            const req = createMockReq('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: '' })
            });

            const { POST } = require('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBeDefined();
        });

        test('should reject requests with oversized payload', async () => {
            mockAuthenticatedUser();

            const largePrompt = 'A'.repeat(60000);
            const req = createMockReq('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: largePrompt })
            });

            const { POST } = require('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        test('should apply AI rate limiting', async () => {
            mockAuthenticatedUser();

            mockLimitApiEndpoint.mockResolvedValue({
                success: false,
                reset: Date.now() + 60000,
                remaining: 0,
                limit: 10
            });

            const req = createMockReq('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: 'Test' })
            });

            const { POST } = require('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBe(429);
            expect(response.headers.get('Retry-After')).toBeDefined();
        });
    });

    describe('/api/conversations/[id] - Conversation Endpoint', () => {
        test('should reject access to non-owned conversation', async () => {
            mockAuthenticatedUser();

            // Mock ownership check (Query path)
            mockQuerySingle.mockResolvedValue({
                data: { user_id: 'other_user', id: '550e8400-e29b-41d4-a716-446655440000' },
                error: null
            });

            const req = createMockReq('http://localhost:3000/api/conversations/550e8400-e29b-41d4-a716-446655440000', {
                method: 'GET'
            });

            const { GET } = require('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toContain('Forbidden');
        });

        test('should allow access to owned conversation', async () => {
            mockAuthenticatedUser('user_123');

            // Mock ownership check (Query path)
            mockQuerySingle.mockResolvedValue({
                data: {
                    user_id: 'user_123',
                    id: '550e8400-e29b-41d4-a716-446655440000',
                    title: 'Test Conversation',
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const req = createMockReq('http://localhost:3000/api/conversations/550e8400-e29b-41d4-a716-446655440000', {
                method: 'GET'
            });

            const { GET } = require('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.id).toBeDefined();
            expect(data.title).toBeDefined();
        });

        test('should validate conversation ID format', async () => {
            mockAuthenticatedUser();

            const req = createMockReq('http://localhost:3000/api/conversations/invalid-id', {
                method: 'GET'
            });

            const { GET } = require('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: 'invalid-id' } });

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('Invalid');
        });

        test('should apply query rate limiting', async () => {
            mockAuthenticatedUser();

            mockLimitApiEndpoint.mockResolvedValue({
                success: false,
                reset: Date.now() + 60000,
                remaining: 0,
                limit: 10
            });

            const req = createMockReq('http://localhost:3000/api/conversations/550e8400-e29b-41d4-a716-446655440000', {
                method: 'GET'
            });

            const { GET } = require('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });

            expect(response.status).toBe(429);
        });
    });

    describe('/api/memory/delete - Memory Delete Endpoint', () => {
        test('should validate fact ID format', async () => {
            mockAuthenticatedUser();

            const req = createMockReq('http://localhost:3000/api/memory/delete', {
                method: 'POST',
                body: JSON.stringify({ factId: 'not-a-uuid' })
            });

            const { POST } = require('@/app/api/memory/delete/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('Invalid');
        });

        test('should apply mutation rate limiting', async () => {
            mockAuthenticatedUser();

            mockLimitApiEndpoint.mockResolvedValue({
                success: false,
                reset: Date.now() + 60000,
                remaining: 0,
                limit: 10
            });

            const req = createMockReq('http://localhost:3000/api/memory/delete', {
                method: 'POST',
                body: JSON.stringify({ factId: '550e8400-e29b-41d4-a716-446655440000' })
            });

            const { POST } = require('@/app/api/memory/delete/route');
            const response = await POST(req);

            expect(response.status).toBe(429);
        });
    });

    describe('/api/image - Image Generation Endpoint', () => {
        test('should validate image generation parameters', async () => {
            mockAuthenticatedUser();

            const invalidParams = {
                prompt: '',
                n: 11,
                size: 'invalid-size'
            };

            const req = createMockReq('http://localhost:3000/api/image', {
                method: 'POST',
                body: JSON.stringify(invalidParams)
            });

            const { POST } = require('@/app/api/image/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
        });

        test('should apply strict AI rate limiting (10 req/min)', async () => {
            mockAuthenticatedUser();

            mockLimitApiEndpoint.mockResolvedValue({
                success: false,
                reset: Date.now() + 60000,
                remaining: 0,
                limit: 10
            });

            const req = createMockReq('http://localhost:3000/api/image', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: 'A beautiful sunset',
                    amount: '1',
                    resolution: '1024x1024'
                })
            });

            const { POST } = require('@/app/api/image/route');
            const response = await POST(req);

            expect(response.status).toBe(429);
            const data = await response.json();
            expect(data.message).toContain('rate limit');
        });
    });

    describe('/api/conversations/new - Create Conversation', () => {
        test('should validate title length', async () => {
            mockAuthenticatedUser();

            const req = createMockReq('http://localhost:3000/api/conversations/new', {
                method: 'POST',
                body: JSON.stringify({ title: 'A'.repeat(101) })
            });

            const { POST } = require('@/app/api/conversations/new/route');
            const response = await POST(req);

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        test('should create conversation with valid title', async () => {
            mockAuthenticatedUser();

            // Mock the INSERT result using the MUTATION mock
            mockMutationSingle.mockResolvedValue({
                data: {
                    id: 'new_conv_123',
                    title: 'Valid Title',
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const req = createMockReq('http://localhost:3000/api/conversations/new', {
                method: 'POST',
                body: JSON.stringify({ title: 'Valid Title' })
            });

            const { POST } = require('@/app/api/conversations/new/route');
            const response = await POST(req);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.conversationId).toBeDefined();
        });
    });

    describe('/api/memory/scope - Toggle Memory Scope', () => {
        test('should validate scope enum values', async () => {
            mockAuthenticatedUser();

            const req = createMockReq('http://localhost:3000/api/memory/scope', {
                method: 'POST',
                body: JSON.stringify({
                    memoryId: '550e8400-e29b-41d4-a716-446655440000',
                    scope: 'invalid-scope'
                })
            });

            const { POST } = require('@/app/api/memory/scope/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('scope');
        });

        test('should verify memory ownership before update', async () => {
            mockAuthenticatedUser();

            // Mock ownership check (Query path)
            mockQuerySingle.mockResolvedValue({
                data: { user_id: 'other_user' },
                error: null
            });

            const req = createMockReq('http://localhost:3000/api/memory/scope', {
                method: 'POST',
                body: JSON.stringify({
                    memoryId: '550e8400-e29b-41d4-a716-446655440000',
                    scope: 'persistent'
                })
            });

            const { POST } = require('@/app/api/memory/scope/route');
            const response = await POST(req);

            expect(response.status).toBe(403);
        });
    });
});
