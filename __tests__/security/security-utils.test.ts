/**
 * Unit Tests for Security Utilities
 * Tests authentication, rate limiting, and input validation
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('Security Utilities - Unit Tests', () => {
    describe('apiAuth.ts', () => {
        describe('requireAuth', () => {
            test('should return user when authenticated', async () => {
                // Mock Clerk auth
                const mockAuth = jest.fn().mockResolvedValue({ userId: 'user_123' });
                jest.mock('@clerk/nextjs/server', () => ({
                    auth: mockAuth
                }));

                const { requireAuth } = await import('@/lib/security/apiAuth');
                const user = await requireAuth();

                expect(user).toEqual({ userId: 'user_123' });
            });

            test('should throw AuthenticationError when not authenticated', async () => {
                const mockAuth = jest.fn().mockResolvedValue({ userId: null });
                jest.mock('@clerk/nextjs/server', () => ({
                    auth: mockAuth
                }));

                const { requireAuth } = await import('@/lib/security/apiAuth');

                await expect(requireAuth()).rejects.toThrow('Authentication required');
            });
        });

        describe('requireOwnership', () => {
            test('should pass when user owns resource', async () => {
                // Mock Supabase
                const mockSupabase = {
                    from: jest.fn().mockReturnThis(),
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockResolvedValue({
                        data: { user_id: 'user_123' },
                        error: null
                    })
                };

                jest.mock('@/lib/supabaseClient', () => ({
                    supabase: mockSupabase
                }));

                const { requireOwnership } = await import('@/lib/security/apiAuth');

                await expect(
                    requireOwnership('user_123', 'resource_456', 'conversations')
                ).resolves.not.toThrow();
            });

            test('should throw AuthorizationError when user does not own resource', async () => {
                const mockSupabase = {
                    from: jest.fn().mockReturnThis(),
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockResolvedValue({
                        data: { user_id: 'other_user' },
                        error: null
                    })
                };

                jest.mock('@/lib/supabaseClient', () => ({
                    supabase: mockSupabase
                }));

                const { requireOwnership } = await import('@/lib/security/apiAuth');

                await expect(
                    requireOwnership('user_123', 'resource_456', 'conversations')
                ).rejects.toThrow('Access denied');
            });

            test('should throw NotFoundError when resource does not exist', async () => {
                const mockSupabase = {
                    from: jest.fn().mockReturnThis(),
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    single: jest.fn().mockResolvedValue({
                        data: null,
                        error: { code: 'PGRST116' }
                    })
                };

                jest.mock('@/lib/supabaseClient', () => ({
                    supabase: mockSupabase
                }));

                const { requireOwnership } = await import('@/lib/security/apiAuth');

                await expect(
                    requireOwnership('user_123', 'resource_456', 'conversations')
                ).rejects.toThrow('not found');
            });
        });

        describe('getClientIP', () => {
            test('should extract IP from x-forwarded-for header', () => {
                const mockReq = {
                    headers: new Headers({
                        'x-forwarded-for': '192.168.1.1, 10.0.0.1'
                    })
                } as Request;

                const { getClientIP } = require('@/lib/security/apiAuth');
                const ip = getClientIP(mockReq);

                expect(ip).toBe('192.168.1.1');
            });

            test('should extract IP from x-real-ip header as fallback', () => {
                const mockReq = {
                    headers: new Headers({
                        'x-real-ip': '203.0.113.1'
                    })
                } as Request;

                const { getClientIP } = require('@/lib/security/apiAuth');
                const ip = getClientIP(mockReq);

                expect(ip).toBe('203.0.113.1');
            });

            test('should return default IP when no headers present', () => {
                const mockReq = {
                    headers: new Headers({})
                } as Request;

                const { getClientIP } = require('@/lib/security/apiAuth');
                const ip = getClientIP(mockReq);

                expect(ip).toBe('127.0.0.1');
            });
        });
    });

    describe('inputValidation.ts', () => {
        describe('UUID validation', () => {
            test('should accept valid UUIDs', () => {
                const { uuidSchema } = require('@/lib/security/inputValidation');

                const validUUIDs = [
                    '550e8400-e29b-41d4-a716-446655440000',
                    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
                    '00000000-0000-0000-0000-000000000000'
                ];

                validUUIDs.forEach(uuid => {
                    expect(() => uuidSchema.parse(uuid)).not.toThrow();
                });
            });

            test('should reject invalid UUIDs', () => {
                const { uuidSchema } = require('@/lib/security/inputValidation');

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
            test('should accept valid prompts', () => {
                const { promptSchema } = require('@/lib/security/inputValidation');

                const validPrompts = [
                    'Hello, world!',
                    'A'.repeat(1000),
                    'A'.repeat(50000) // Max length
                ];

                validPrompts.forEach(prompt => {
                    expect(() => promptSchema.parse(prompt)).not.toThrow();
                });
            });

            test('should reject invalid prompts', () => {
                const { promptSchema } = require('@/lib/security/inputValidation');

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
            test('should pass for requests under size limit', () => {
                const { validateRequestSize } = require('@/lib/security/inputValidation');

                const smallObject = { data: 'x'.repeat(100) };

                expect(() => validateRequestSize(smallObject, 1024)).not.toThrow();
            });

            test('should throw for requests over size limit', () => {
                const { validateRequestSize } = require('@/lib/security/inputValidation');

                const largeObject = { data: 'x'.repeat(10000) };

                expect(() => validateRequestSize(largeObject, 1024)).toThrow('Request payload too large');
            });
        });

        describe('Image generation validation', () => {
            test('should accept valid image generation params', () => {
                const { imageGenerationSchema } = require('@/lib/security/inputValidation');

                const validParams = {
                    prompt: 'A beautiful sunset',
                    n: 1,
                    size: '1024x1024',
                    quality: 'standard'
                };

                expect(() => imageGenerationSchema.parse(validParams)).not.toThrow();
            });

            test('should reject invalid image generation params', () => {
                const { imageGenerationSchema } = require('@/lib/security/inputValidation');

                const invalidParams = {
                    prompt: '', // Empty prompt
                    n: 11, // Too many images
                    size: 'invalid-size'
                };

                expect(() => imageGenerationSchema.parse(invalidParams)).toThrow();
            });
        });
    });
});
