/**
 * Unit Tests for Security Utilities
 * Tests authentication, rate limiting, and input validation
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Define mocks outside describe to be accessible
const mockAuth = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

// Setup mock chain
mockEq.mockReturnValue({ single: mockSingle });
mockSelect.mockReturnValue({ eq: mockEq });
mockFrom.mockReturnValue({ select: mockSelect });

// Mock modules
jest.mock('@clerk/nextjs/server', () => ({
    auth: jest.fn()
}));

jest.mock('@/lib/supabaseClient', () => ({
    supabaseAdmin: {
        from: mockFrom
    }
}));

describe('Security Utilities - Unit Tests', () => {
    describe('apiAuth.ts', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            // Reset default behaviors
            mockFrom.mockReturnValue({ select: mockSelect });
            mockSelect.mockReturnValue({ eq: mockEq });
            mockEq.mockReturnValue({ single: mockSingle });
        });

        describe('requireAuth', () => {
            test('should return user when authenticated', async () => {
                const { auth } = require('@clerk/nextjs/server');
                auth.mockResolvedValue({ userId: 'user_123' });

                const { requireAuth } = await import('@/lib/security/apiAuth');
                const user = await requireAuth();

                expect(user).toEqual({ userId: 'user_123' });
            });

            test('should throw AuthenticationError when not authenticated', async () => {
                const { auth } = require('@clerk/nextjs/server');
                auth.mockResolvedValue({ userId: null });

                const { requireAuth } = await import('@/lib/security/apiAuth');

                await expect(requireAuth()).rejects.toThrow('Authentication required');
            });
        });

        describe('requireOwnership', () => {
            test('should pass when user owns resource', async () => {
                mockSingle.mockResolvedValue({
                    data: { user_id: 'user_123' },
                    error: null
                });

                const { requireOwnership } = await import('@/lib/security/apiAuth');

                await expect(
                    requireOwnership('user_123', 'resource_456', 'conversations')
                ).resolves.not.toThrow();
            });

            test('should throw AuthorizationError when user does not own resource', async () => {
                mockSingle.mockResolvedValue({
                    data: { user_id: 'other_user' },
                    error: null
                });

                const { requireOwnership } = await import('@/lib/security/apiAuth');

                await expect(
                    requireOwnership('user_123', 'resource_456', 'conversations')
                ).rejects.toThrow('You do not have permission to access this resource');
            });

            test('should throw AuthorizationError when resource does not exist', async () => {
                mockSingle.mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' }
                });

                const { requireOwnership } = await import('@/lib/security/apiAuth');

                await expect(
                    requireOwnership('user_123', 'resource_456', 'conversations')
                ).rejects.toThrow('Resource not found or access denied');
            });
        });

        describe('getClientIP', () => {
            test('should extract IP from x-forwarded-for header', async () => {
                const { getClientIP } = await import('@/lib/security/apiAuth');
                const mockReq = {
                    headers: new Headers({
                        'x-forwarded-for': '192.168.1.1, 10.0.0.1'
                    })
                } as Request;

                const ip = getClientIP(mockReq);
                expect(ip).toBe('192.168.1.1');
            });

            test('should extract IP from x-real-ip header as fallback', async () => {
                const { getClientIP } = await import('@/lib/security/apiAuth');
                const mockReq = {
                    headers: new Headers({
                        'x-real-ip': '203.0.113.1'
                    })
                } as Request;

                const ip = getClientIP(mockReq);
                expect(ip).toBe('203.0.113.1');
            });

            test('should return unknown when no headers present', async () => {
                const { getClientIP } = await import('@/lib/security/apiAuth');
                const mockReq = {
                    headers: new Headers({})
                } as Request;

                const ip = getClientIP(mockReq);
                expect(ip).toBe('unknown');
            });
        });
    });

    describe('inputValidation.ts', () => {
        describe('UUID validation', () => {
            test('should accept valid UUIDs', async () => {
                const { uuidSchema } = await import('@/lib/security/inputValidation');

                const validUUIDs = [
                    '550e8400-e29b-41d4-a716-446655440000',
                    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
                    '00000000-0000-0000-0000-000000000000'
                ];

                validUUIDs.forEach(uuid => {
                    expect(() => uuidSchema.parse(uuid)).not.toThrow();
                });
            });

            test('should reject invalid UUIDs', async () => {
                const { uuidSchema } = await import('@/lib/security/inputValidation');

                const invalidUUIDs = [
                    'not-a-uuid',
                    '12345',
                    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                    ''
                ];

                invalidUUIDs.forEach(uuid => {
                    expect(() => uuidSchema.parse(uuid)).toThrow();
                });
            });
        });

        describe('Prompt validation', () => {
            test('should accept valid prompts', async () => {
                const { promptSchema } = await import('@/lib/security/inputValidation');

                const validPrompts = [
                    'Hello, world!',
                    'A'.repeat(1000),
                    'A'.repeat(50000) // Max length
                ];

                validPrompts.forEach(prompt => {
                    expect(() => promptSchema.parse(prompt)).not.toThrow();
                });
            });

            test('should reject invalid prompts', async () => {
                const { promptSchema } = await import('@/lib/security/inputValidation');

                const invalidPrompts = [
                    '', // Empty
                    'A'.repeat(50001) // Too long
                ];

                invalidPrompts.forEach(prompt => {
                    expect(() => promptSchema.parse(prompt)).toThrow();
                });
            });
        });

        describe('Request size validation', () => {
            test('should pass for requests under size limit', async () => {
                const { validateRequestSize } = await import('@/lib/security/inputValidation');

                const smallObject = { data: 'x'.repeat(100) };

                expect(() => validateRequestSize(smallObject, 1024)).not.toThrow();
            });

            test('should throw for requests over size limit', async () => {
                const { validateRequestSize } = await import('@/lib/security/inputValidation');

                const largeObject = { data: 'x'.repeat(10000) };

                expect(() => validateRequestSize(largeObject, 1024)).toThrow(/Request body too large/);
            });
        });

        describe('Image generation validation', () => {
            test('should accept valid image generation params', async () => {
                const { imageGenerationSchema } = await import('@/lib/security/inputValidation');

                const validParams = {
                    prompt: 'A beautiful sunset',
                    amount: "1",
                    resolution: '1:1',
                    model: 'flux-schnell'
                };

                expect(() => imageGenerationSchema.parse(validParams)).not.toThrow();
            });

            test('should reject invalid image generation params', async () => {
                const { imageGenerationSchema } = await import('@/lib/security/inputValidation');

                const invalidParams = {
                    prompt: '', // Empty prompt
                    amount: "11", // Too many images
                    resolution: 'invalid-size'
                };

                expect(() => imageGenerationSchema.parse(invalidParams)).toThrow();
            });
        });
    });
});
