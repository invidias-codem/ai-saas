/**
 * End-to-End Security Tests
 * Tests complete security flows including rate limiting, ownership validation, and multi-step operations
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

describe('Security - E2E Tests', () => {
    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let authToken: string;
    let testUserId: string;
    let ownedConversationId: string;
    let otherUserConversation Id: string;

    beforeAll(async () => {
        // Setup: Get auth token for testing
        // In a real scenario, you'd get this from your auth system
        authToken = process.env.TEST_AUTH_TOKEN || '';
        testUserId = process.env.TEST_USER_ID || '';

        if (!authToken) {
            console.warn('⚠️  TEST_AUTH_TOKEN not set. E2E tests will be skipped.');
        }
    });

    afterAll(async () => {
        // Cleanup: Delete test data
        // This would clean up any conversations or memories created during tests
    });

    describe('Rate Limiting - AI Endpoints', () => {
        test('should enforce 20 req/min limit on /api/chat', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            const requests: Promise<Response>[] = [];
            const totalRequests = 25; // Exceed the 20 req/min limit

            // Send 25 rapid requests
            for (let i = 0; i < totalRequests; i++) {
                requests.push(
                    fetch(`${BASE_URL}/api/chat`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ prompt: `Test ${i}` })
                    })
                );
            }

            const responses = await Promise.all(requests);
            const successCount = responses.filter(r => r.status === 200).length;
            const rateLimitedCount = responses.filter(r => r.status === 429).length;

            // Should have ~20 successful and ~5 rate-limited
            expect(successCount).toBeLessThanOrEqual(20);
            expect(rateLimitedCount).toBeGreaterThanOrEqual(5);

            // First rate-limited response should have Retry-After header
            const firstRateLimited = responses.find(r => r.status === 429);
            expect(firstRateLimited?.headers.get('Retry-After')).toBeDefined();
        }, 30000); // 30 second timeout

        test('should enforce stricter limit (10 req/min) on /api/image', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            const requests: Promise<Response>[] = [];
            const totalRequests = 15; // Exceed the 10 req/min limit

            for (let i = 0; i < totalRequests; i++) {
                requests.push(
                    fetch(`${BASE_URL}/api/image`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${authToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            prompt: `Test image ${i}`,
                            n: 1,
                            size: '256x256'
                        })
                    })
                );
            }

            const responses = await Promise.all(requests);
            const rateLimitedCount = responses.filter(r => r.status === 429).length;

            // Should have at least 5 rate-limited (15 total - 10 allowed)
            expect(rateLimitedCount).toBeGreaterThanOrEqual(5);
        }, 30000);

        test('should reset rate limit after window expires', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            // Make a request
            const firstResponse = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: 'Test 1' })
            });

            expect(firstResponse.status).toBe(200);

            // Wait for rate limit window to reset (61 seconds)
            await new Promise(resolve => setTimeout(resolve, 61000));

            // Make another request - should succeed
            const secondResponse = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: 'Test 2' })
            });

            expect(secondResponse.status).toBe(200);
        }, 90000); // 90 second timeout
    });

    describe('Ownership Validation - Conversations', () => {
        test('should prevent accessing another user\'s conversation', async () => {
            if (!authToken || !otherUserConversationId) {
                console.log('Skipping E2E test - missing auth or conversation ID');
                return;
            }

            const response = await fetch(`${BASE_URL}/api/conversations/${otherUserConversationId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(response.status).toBe(403);
            const data = await response.json();
            expect(data.error).toContain('Access denied');
        });

        test('should allow accessing own conversation', async () => {
            if (!authToken || !ownedConversationId) {
                console.log('Skipping E2E test - missing auth or conversation ID');
                return;
            }

            const response = await fetch(`${BASE_URL}/api/conversations/${ownedConversationId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.conversation).toBeDefined();
            expect(data.conversation.id).toBe(ownedConversationId);
        });

        test('should prevent updating another user\'s conversation', async () => {
            if (!authToken || !otherUserConversationId) {
                console.log('Skipping E2E test - missing auth or conversation ID');
                return;
            }

            const response = await fetch(`${BASE_URL}/api/conversations/${otherUserConversationId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: 'Hacked Title' })
            });

            expect(response.status).toBe(403);
        });

        test('should prevent deleting another user\'s conversation', async () => {
            if (!authToken || !otherUserConversationId) {
                console.log('Skipping E2E test - missing auth or conversation ID');
                return;
            }

            const response = await fetch(`${BASE_URL}/api/conversations/${otherUserConversationId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(response.status).toBe(403);
        });
    });

    describe('Input Validation - Comprehensive', () => {
        test('should reject malformed UUIDs across all endpoints', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            const invalidUUID = 'not-a-uuid';
            const endpoints = [
                `/api/conversations/${invalidUUID}`,
                `/api/memory/delete`,
                `/api/memory/extend`,
                `/api/memory/scope`
            ];

            for (const endpoint of endpoints) {
                const isMemoryEndpoint = endpoint.includes('/memory/');
                const response = await fetch(`${BASE_URL}${endpoint}`, {
                    method: isMemoryEndpoint ? 'POST' : 'GET',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: isMemoryEndpoint ? JSON.stringify({
                        factId: invalidUUID,
                        memoryId: invalidUUID
                    }) : undefined
                });

                expect(response.status).toBe(400);
                const data = await response.json();
                expect(data.error).toBeDefined();
            }
        });

        test('should reject oversized prompts', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            const oversizedPrompt = 'A'.repeat(60000); // Over 50k limit

            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: oversizedPrompt })
            });

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        test('should reject empty prompts', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: '' })
            });

            expect(response.status).toBe(400);
        });

        test('should reject invalid filter parameters on vault endpoint', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            const response = await fetch(`${BASE_URL}/api/conversations/vault?filter=invalid-filter`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('Invalid filter');
        });
    });

    describe('Authentication - Comprehensive', () => {
        test('should reject all endpoints without authentication', async () => {
            const endpoints = [
                { path: '/api/chat', method: 'POST' },
                { path: '/api/code', method: 'POST' },
                { path: '/api/image', method: 'POST' },
                { path: '/api/video', method: 'POST' },
                { path: '/api/music', method: 'POST' },
                { path: '/api/conversations', method: 'GET' },
                { path: '/api/conversations/new', method: 'POST' },
                { path: '/api/memory/preferences', method: 'GET' },
                { path: '/api/memory/count', method: 'GET' },
                { path: '/api/memory/analytics', method: 'GET' }
            ];

            for (const { path, method } of endpoints) {
                const response = await fetch(`${BASE_URL}${path}`, {
                    method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: method === 'POST' ? JSON.stringify({}) : undefined
                });

                expect(response.status).toBe(401);
                const data = await response.json();
                expect(data.error).toBeDefined();
            }
        });

        test('should reject requests with invalid/expired tokens', async () => {
            const invalidToken = 'invalid_token_123';

            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${invalidToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prompt: 'Test' })
            });

            expect(response.status).toBe(401);
        });
    });

    describe('Multi-Step Security Flows', () => {
        test('complete secure conversation flow: create → update → read → delete', async () => {
            if (!authToken) {
                console.log('Skipping E2E test - no auth token');
                return;
            }

            // 1. Create conversation
            const createResponse = await fetch(`${BASE_URL}/api/conversations/new`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: 'E2E Test Conversation' })
            });

            expect(createResponse.status).toBe(200);
            const createData = await createResponse.json();
            const conversationId = createData.conversationId;

            // 2. Update conversation
            const updateResponse = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: 'Updated Title' })
            });

            expect(updateResponse.status).toBe(200);

            // 3. Read conversation
            const readResponse = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(readResponse.status).toBe(200);
            const readData = await readResponse.json();
            expect(readData.conversation.title).toBe('Updated Title');

            // 4. Delete conversation
            const deleteResponse = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(deleteResponse.status).toBe(200);

            // 5. Verify deletion (should return 404)
            const verifyResponse = await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            expect(verifyResponse.status).toBe(404);
        }, 30000);
    });
});
