/**
 * Slack Engineer Command & Interactivity Tests
 * Tests for the autonomous engineering agent integration
 */

// Mock executes of external scripts
// IMPORTANT: Mock creation needs to be before imports, but checking how Jest handles modules.
// We mock 'child_process' to intercept execSync.
jest.mock('child_process', () => ({
    execSync: jest.fn().mockImplementation((command) => {
        if (command && command.includes('--plan-only')) {
            return `
---JSON_START---
{
  "plan": "Test plan description",
  "steps": [
    { "type": "write", "path": "test.txt", "content": "hello" }
  ]
}
---JSON_END---
`;
        }
        return 'Execution output';
    }),
}));

// Mock NextResponse before importing the route
jest.mock('next/server', () => {
    const MockNextResponse: any = jest.fn().mockImplementation((body: any, init?: any) => ({
        status: init?.status || 200,
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
        headers: new Map(Object.entries(init?.headers || {})),
    }));

    MockNextResponse.json = jest.fn((data: any, init?: any) => ({
        status: init?.status || 200,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
    }));

    return {
        NextResponse: MockNextResponse,
    };
});

// Mock dependencies
jest.mock('@/lib/slack/tokenManager', () => ({
    getSlackConfig: jest.fn(),
}));

jest.mock('@google/generative-ai', () => {
    // Return a mock class
    return {
        GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
            getGenerativeModel: jest.fn().mockReturnValue({
                startChat: jest.fn().mockReturnValue({
                    sendMessage: jest.fn().mockResolvedValue({
                        response: { text: () => 'Response' }
                    }),
                }),
            }),
        })),
        HarmCategory: {},
        HarmBlockThreshold: {},
    };
});

// Mock fetch
global.fetch = jest.fn();

// Import routes (will use mocks)
import { POST as POST_COMMAND } from '@/app/api/integrations/slack/command/route';
import { POST as POST_INTERACTIVITY } from '@/app/api/integrations/slack/interactivity/route';

describe('Slack Engineering Integration', () => {
    const mockSlackConfig = {
        teamId: 'T123ABC456',
        botToken: 'xoxb-test-token',
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default config mock
        const { getSlackConfig } = require('@/lib/slack/tokenManager');
        getSlackConfig.mockResolvedValue(mockSlackConfig);

        // Setup fetch mock
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ ok: true }),
        });

        // Env vars
        process.env.SLACK_SIGNING_SECRET = 'test-secret';
        process.env.GOOGLE_API_KEY = 'test-key';
    });

    const createCommandRequest = (text: string) => {
        const body = new URLSearchParams({
            team_id: 'T123ABC456',
            user_id: 'U_TEST',
            command: '/genie',
            text: text,
            response_url: 'https://hooks.slack.com/commands/test',
        }).toString();

        return new Request('http://localhost/api/integrations/slack/command', {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
                'x-slack-signature': 'v0=test-signature',
            },
        });
    };

    // Helper to bypass signature verification in tests
    const bypassSignature = () => {
        const crypto = require('crypto');
        jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(true);
    };

    describe('/genie engineer', () => {
        it('should calculate a plan and return blocks with approval buttons', async () => {
            bypassSignature();
            const request = createCommandRequest('engineer Add login page');
            const response = await POST_COMMAND(request);
            const data = await response.json();

            // The immediate response is a loading message
            expect(response.status).toBe(200);
            expect(data.response_type).toBe('ephemeral');
            expect(data.text).toContain('🦞 Planning engineering task...');

            // Wait for async processing (waitUntil)
            await new Promise(r => setTimeout(r, 100));

            // Verify execSync called
            const { execSync } = require('child_process');
            expect(execSync).toHaveBeenCalledWith(
                expect.stringContaining('--plan-only'),
                expect.anything()
            );

            // Verify fetch called with correct response_url and payload
            expect(global.fetch).toHaveBeenCalledWith(
                'https://hooks.slack.com/commands/test',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('GenieBot Engineering Plan')
                })
            );
        });

        it('should return ephemeral error if task is missing', async () => {
            bypassSignature();
            const request = createCommandRequest('engineer'); // no task
            const response = await POST_COMMAND(request);
            const data = await response.json();

            // Should return immediate loading message? 
            // No, invalid args are handled immediately in buildResponse, BUT buildResponse is called async.
            // Wait. POST returns immediate loading message using `codeCommands.includes`. 
            // Yes, engineer is in codeCommands.
            // So it returns '🦞 Planning...' immediately.

            expect(data.text).toContain('🦞 Planning engineering task...');

            // Wait for async
            await new Promise(r => setTimeout(r, 100));

            // It should call fetch with error message
            expect(global.fetch).toHaveBeenCalledWith(
                'https://hooks.slack.com/commands/test',
                expect.objectContaining({
                    body: expect.stringContaining('Please describe the engineering task')
                })
            );
        });
    });

    describe('Interactivity', () => {
        const createInteractivityRequest = (actionId: string, value: string) => {
            const payload = {
                type: 'block_actions',
                team: { id: 'T123ABC456' },
                user: { id: 'U_TEST', },
                response_url: 'https://hooks.slack.com/actions/test',
                actions: [{ action_id: actionId, value: value }],
            };

            const body = new URLSearchParams({
                payload: JSON.stringify(payload)
            }).toString();

            return new Request('http://localhost/api/integrations/slack/interactivity', {
                method: 'POST',
                body,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
                    'x-slack-signature': 'v0=test-signature',
                }
            });
        };

        it('should execute the plan when approved', async () => {
            bypassSignature();
            const plan = { task: 'test', plan: { steps: [] } };
            const request = createInteractivityRequest('engineer_approve', JSON.stringify(plan));

            const response = await POST_INTERACTIVITY(request);
            expect(response.status).toBe(200);

            // Immediate update to "Approved"
            // Wait for async
            await new Promise(r => setTimeout(r, 200));

            // 1. fetch called to update to "Approved..."
            // 2. fetch called to update to "Completed..." (after async exec)

            expect(global.fetch).toHaveBeenCalledWith(
                'https://hooks.slack.com/actions/test',
                expect.objectContaining({
                    body: expect.stringContaining('Approved!'),
                })
            );

            const { execSync } = require('child_process');
            expect(execSync).toHaveBeenCalledWith(
                expect.stringContaining('--execute-plan'),
                expect.anything()
            );
        });

        it('should cancel the task when cancelled', async () => {
            bypassSignature();
            const request = createInteractivityRequest('engineer_cancel', 'test task');
            const response = await POST_INTERACTIVITY(request);
            expect(response.status).toBe(200);

            await new Promise(r => setTimeout(r, 100));

            expect(global.fetch).toHaveBeenCalledWith(
                'https://hooks.slack.com/actions/test',
                expect.objectContaining({
                    body: expect.stringContaining('Cancelled'),
                })
            );
        });
    });
});
