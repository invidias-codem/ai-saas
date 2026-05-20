
import { shouldFetchContext, getChannelHistory } from '@/lib/slack/assistantHelpers';
import { KINDNESS_SYSTEM_PROMPT } from '@/lib/slack/codeAssistant';

// Mock GoogleGenerativeAI to avoid initialization issues
jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
            startChat: jest.fn(),
        }),
    })),
}));

// Mock global fetch
global.fetch = jest.fn();

describe('Genie Kindness & Context Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('shouldFetchContext', () => {
        it('detects context keywords correctly', () => {
            expect(shouldFetchContext('can you summarize this channel?')).toBe(true);
            expect(shouldFetchContext('what is the vibe here?')).toBe(true);
            expect(shouldFetchContext('catch me up on what happened')).toBe(true);
            expect(shouldFetchContext('give me context')).toBe(true);
        });

        it('returns false for unrelated queries', () => {
            expect(shouldFetchContext('write a python script')).toBe(false);
            expect(shouldFetchContext('hello genie')).toBe(false);
            expect(shouldFetchContext('debug this code')).toBe(false);
        });

        it('is case insensitive', () => {
            expect(shouldFetchContext('SUMMARIZE the Channel')).toBe(true);
        });
    });

    describe('KINDNESS_SYSTEM_PROMPT', () => {
        it('contains key persona traits', () => {
            expect(KINDNESS_SYSTEM_PROMPT).toContain('Friendly Professional');
            expect(KINDNESS_SYSTEM_PROMPT).toContain('direct');
            expect(KINDNESS_SYSTEM_PROMPT).toContain('supportive');
        });

        it('contains negativity handling instructions', () => {
            expect(KINDNESS_SYSTEM_PROMPT.toLowerCase()).toContain('negativity');
            expect(KINDNESS_SYSTEM_PROMPT).toContain('Pivot');
        });
    });

    describe('getChannelHistory', () => {
        const mockToken = 'mock-token';
        const mockChannel = 'C123';

        it('fetches and sanitizes messages correctly', async () => {
            const mockResponse = {
                ok: true,
                messages: [
                    { type: 'message', user: 'U1', text: 'Recent msg', ts: '1002' },
                    { type: 'message', user: 'U2', text: 'Older msg', ts: '1001' },
                    { type: 'message', subtype: 'channel_join', text: 'joined', ts: '1000' }, // Should be filtered
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValueOnce(mockResponse),
            });

            const result = await getChannelHistory(mockToken, mockChannel, 5);

            expect(result.ok).toBe(true);
            expect(result.messages).toHaveLength(2); // subtype excluded
            expect(result.messages?.[0].text).toBe('Older msg'); // Check reverse order (oldest first)
            expect(result.messages?.[1].text).toBe('Recent msg');

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/conversations.history?channel=C123'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${mockToken}`
                    })
                })
            );
        });

        it('handles API errors gracefully', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValueOnce({ ok: false, error: 'channel_not_found' }),
            });

            const result = await getChannelHistory(mockToken, mockChannel);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('channel_not_found');
        });

        it('handles network errors', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

            const result = await getChannelHistory(mockToken, mockChannel);
            expect(result.ok).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });
});
