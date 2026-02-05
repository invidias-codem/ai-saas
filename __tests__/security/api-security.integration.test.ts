/**
 * Integration Tests for Secured API Endpoints
 * Tests authentication, rate limiting, ownership validation, and input validation
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';

describe('API Security - Integration Tests', () => {
    let mockAuth: jest.Mock;
    let mockSupabase: any;

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();

        // Mock Clerk authentication
        mockAuth = jest.fn();
        jest.mock('@clerk/nextjs/server', () => ({
            auth: mockAuth
        }));

        // Mock Supabase client
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis()
        };

        jest.mock('@/lib/supabaseClient', () => ({
            supabase: mockSupabase,
            supabaseAdmin: mockSupabase
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('/api/chat - Chat Endpoint', () => {
        test('should reject unauthenticated requests', async () => {
            mockAuth.mockResolvedValue({ userId: null });

            const req = new NextRequest('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: 'Hello' })
            });

            const { POST } = await import('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data.error).toContain('Unauthorized');
        });

        test('should reject requests with invalid prompt', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const req = new NextRequest('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: '' }) // Empty prompt
            });

            const { POST } = await import('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toBeDefined();
        });

        test('should reject requests with oversized payload', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const largePrompt = 'A'.repeat(60000); // Over 50k limit
            const req = new NextRequest('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: largePrompt })
            });

            const { POST } = await import('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        test('should apply AI rate limiting', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            // Mock rate limiter to simulate exceeded limit
            const mockRateLimiter = {
                limit: jest.fn().mockResolvedValue({
                    success: false,
                    reset: Date.now() + 60000,
                    remaining: 0
                })
            };

            jest.mock('@upstash/ratelimit', () => ({
                Ratelimit: jest.fn(() => mockRateLimiter)
            }));

            const req = new NextRequest('http://localhost:3000/api/chat', {
                method: 'POST',
                body: JSON.stringify({ prompt: 'Test' })
            });

            const { POST } = await import('@/app/api/chat/route');
            const response = await POST(req);

            expect(response.status).toBe(429);
            expect(response.headers.get('Retry-After')).toBeDefined();
        });
    });

    describe('/api/conversations/[id] - Conversation Endpoint', () => {
        test('should reject access to non-owned conversation', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            // Mock conversation owned by different user
            mockSupabase.single.mockResolvedValue({
                data: { user_id: 'other_user', id: 'conv_456' },
                error: null
            });

            const req = new NextRequest('http://localhost:3000/api/conversations/conv_456', {
                method: 'GET'
            });

            const { GET } = await import('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: 'conv_456' } });

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toContain('Access denied');
        });

        test('should allow access to owned conversation', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            // Mock conversation owned by current user
            mockSupabase.single.mockResolvedValue({
                data: {
                    user_id: 'user_123',
                    id: 'conv_456',
                    title: 'Test Conversation',
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const req = new NextRequest('http://localhost:3000/api/conversations/conv_456', {
                method: 'GET'
            });

            const { GET } = await import('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: 'conv_456' } });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.conversation).toBeDefined();
        });

        test('should validate conversation ID format', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const req = new NextRequest('http://localhost:3000/api/conversations/invalid-id', {
                method: 'GET'
            });

            const { GET } = await import('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: 'invalid-id' } });

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('Invalid');
        });

        test('should apply query rate limiting', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            // Mock rate limiter
            const mockRateLimiter = {
                limit: jest.fn().mockResolvedValue({
                    success: false,
                    reset: Date.now() + 60000,
                    remaining: 0
                })
            };

            jest.mock('@upstash/ratelimit', () => ({
                Ratelimit: jest.fn(() => mockRateLimiter)
            }));

            const req = new NextRequest('http://localhost:3000/api/conversations/conv_456', {
                method: 'GET'
            });

            const { GET } = await import('@/app/api/conversations/[id]/route');
            const response = await GET(req, { params: { id: 'conv_456' } });

            expect(response.status).toBe(429);
        });
    });

    describe('/api/memory/delete - Memory Delete Endpoint', () => {
        test('should validate fact ID format', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const req = new NextRequest('http://localhost:3000/api/memory/delete', {
                method: 'POST',
                body: JSON.stringify({ factId: 'not-a-uuid' })
            });

            const { POST } = await import('@/app/api/memory/delete/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('Invalid');
        });

        test('should apply mutation rate limiting', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const mockRateLimiter = {
                limit: jest.fn().mockResolvedValue({
                    success: false,
                    reset: Date.now() + 60000,
                    remaining: 0
                })
            };

            jest.mock('@upstash/ratelimit', () => ({
                Ratelimit: jest.fn(() => mockRateLimiter)
            }));

            const req = new NextRequest('http://localhost:3000/api/memory/delete', {
                method: 'POST',
                body: JSON.stringify({ factId: '550e8400-e29b-41d4-a716-446655440000' })
            });

            const { POST } = await import('@/app/api/memory/delete/route');
            const response = await POST(req);

            expect(response.status).toBe(429);
        });
    });

    describe('/api/image - Image Generation Endpoint', () => {
        test('should validate image generation parameters', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const invalidParams = {
                prompt: '',  // Empty prompt
                n: 11,       // Too many images
                size: 'invalid-size'
            };

            const req = new NextRequest('http://localhost:3000/api/image', {
                method: 'POST',
                body: JSON.stringify(invalidParams)
            });

            const { POST } = await import('@/app/api/image/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
        });

        test('should apply strict AI rate limiting (10 req/min)', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const mockRateLimiter = {
                limit: jest.fn().mockResolvedValue({
                    success: false,
                    reset: Date.now() + 60000,
                    remaining: 0
                })
            };

            jest.mock('@upstash/ratelimit', () => ({
                Ratelimit: jest.fn(() => mockRateLimiter)
            }));

            const req = new NextRequest('http://localhost:3000/api/image', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: 'A beautiful sunset',
                    n: 1,
                    size: '1024x1024'
                })
            });

            const { POST } = await import('@/app/api/image/route');
            const response = await POST(req);

            expect(response.status).toBe(429);
            const data = await response.json();
            expect(data.message).toContain('rate limit');
        });
    });

    describe('/api/conversations/new - Create Conversation', () => {
        test('should validate title length', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const req = new NextRequest('http://localhost:3000/api/conversations/new', {
                method: 'POST',
                body: JSON.stringify({ title: 'A'.repeat(101) }) // Over 100 char limit
            });

            const { POST } = await import('@/app/api/conversations/new/route');
            const response = await POST(req);

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        test('should create conversation with valid title', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            mockSupabase.single.mockResolvedValue({
                data: {
                    id: 'new_conv_123',
                    title: 'Valid Title',
                    created_at: new Date().toISOString()
                },
                error: null
            });

            const req = new NextRequest('http://localhost:3000/api/conversations/new', {
                method: 'POST',
                body: JSON.stringify({ title: 'Valid Title' })
            });

            const { POST } = await import('@/app/api/conversations/new/route');
            const response = await POST(req);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.conversationId).toBeDefined();
        });
    });

    describe('/api/memory/scope - Toggle Memory Scope', () => {
        test('should validate scope enum values', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            const req = new NextRequest('http://localhost:3000/api/memory/scope', {
                method: 'POST',
                body: JSON.stringify({
                    memoryId: '550e8400-e29b-41d4-a716-446655440000',
                    scope: 'invalid-scope' // Not 'conversation' or 'persistent'
                })
            });

            const { POST } = await import('@/app/api/memory/scope/route');
            const response = await POST(req);

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('scope');
        });

        test('should verify memory ownership before update', async () => {
            mockAuth.mockResolvedValue({ userId: 'user_123' });

            // Mock memory owned by different user
            mockSupabase.single.mockResolvedValue({
                data: { user_id: 'other_user' },
                error: null
            });

            const req = new NextRequest('http://localhost:3000/api/memory/scope', {
                method: 'POST',
                body: JSON.stringify({
                    memoryId: '550e8400-e29b-41d4-a716-446655440000',
                    scope: 'persistent'
                })
            });

            const { POST } = await import('@/app/api/memory/scope/route');
            const response = await POST(req);

            expect(response.status).toBe(403);
        });
    });
});
