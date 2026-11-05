/**
 * Slack Engineer Command & Interactivity Tests
 * Tests for the autonomous engineering agent integration
 */

// Mock executes of external scripts
// IMPORTANT: Mock creation needs to be before imports, but checking how Jest handles modules.
// We mock 'child_process' to intercept execFileSync.
jest.mock('child_process', () => ({
    execFileSync: jest.fn().mockImplementation((file: string, args: string[]) => {
        if (args && args.some((a: string) => a === '--plan-only')) {
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
    execSync: jest.fn(),
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

// Mock the shared Slack verification to always pass in tests
jest.mock('@/lib/slack/slackVerification', () => ({
  requireSlackSignature: jest.fn().mockReturnValue(null),
  verifySlackSignature: jest.fn().mockReturnValue({ valid: true }),
}));

// Mock the shared Slack telemetry
jest.mock('@/lib/slack/slackTelemetry', () => ({
  emitSlackTelemetry: jest.fn(),
  extractTelemetryFields: jest.fn().mockReturnValue({
    teamId: 'T123ABC456',
    eventType: 'interactivity',
    channelId: 'C_CHANNEL_123',
    threadTs: '',
    userId: 'U_USER_123'
  }),
}));

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
}));

// Mock admin verification
jest.mock('@/lib/slack/adminVerification', () => ({
  verifySlackAdmin: jest.fn().mockResolvedValue({ isAdmin: true, reason: 'workspace_admin' }),
}));

// Mock Google Generative AI
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
        HarmCategory: {
            HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
            HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
            HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        },
        HarmBlockThreshold: {
            BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
        },
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
        botToken: '«redacted:xox…»',
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
        process.env.GENIE_LOCAL = '1';
        process.env.ENGINEER_SCRIPT_PATH = '/tmp/engineer.mjs';
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

    const createInteractivityRequest = (actionId: string, value: string) => {
        const payload = {
            type: 'block_actions',
            team: { id: 'T123ABC456' },
            user: { id: 'U_TEST' },
            trigger_id: 'trg_TEST',
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

    describe('/genie engineer', () => {
        it('should calculate a plan and return blocks with approval buttons', async () => {
            const request = createCommandRequest('engineer Add login page');
            const response = await POST_COMMAND(request);
            const data = await response.json();

            // The immediate response is a loading message
            expect(response.status).toBe(200);
            expect(data.response_type).toBe('ephemeral');
            expect(data.text).toContain('🦞 Planning engineering task...');

            // Wait for async processing (waitUntil)
            await new Promise(r => setTimeout(r, 100));

            // Verify execFileSync called
            const { execFileSync } = require('child_process');
            expect(execFileSync).toHaveBeenCalledWith(
                'node',
                expect.arrayContaining(['--plan-only']),
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
        it('should return disabled message for engineer_approve (S3+ Relay-backed approval required)', async () => {
            const plan = { task: 'test', plan: { steps: [] } };
            const request = createInteractivityRequest('engineer_approve', JSON.stringify(plan));

            const response = await POST_INTERACTIVITY(request);
            expect(response.status).toBe(200);

            await new Promise(r => setTimeout(r, 100));

            // Should return disabled message, NOT execute plan
            expect(global.fetch).toHaveBeenCalledWith(
                'https://hooks.slack.com/actions/test',
                expect.objectContaining({
                    body: expect.stringContaining('Engineer Approval Disabled'),
                })
            );

            // execFileSync should NOT be called
            const { execFileSync } = require('child_process');
            expect(execFileSync).not.toHaveBeenCalled();
        });

        it('should cancel the task when cancelled', async () => {
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
