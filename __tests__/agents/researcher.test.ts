
import { performResearch } from '@/lib/agents/researcher';
import { searchWeb } from '@/lib/integrations/anyCrawl';

// Mock dependencies
jest.mock('@/lib/env', () => ({
    requireEnv: jest.fn().mockReturnValue('mock-key')
}));

jest.mock('@/lib/integrations/anyCrawl', () => ({
    searchWeb: jest.fn().mockResolvedValue([{ title: 'Mock Result', url: 'http://mock.com', snippet: 'Mock snippet' }])
}));

// Mock GoogleGenerativeAI
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
    generateContent: mockGenerateContent
});

jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel
    }))
}));

describe('Researcher Agent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should skip search when file is attached and query implies analysis', async () => {
        const result = await performResearch("Analyze this code file", "", { hasFileAttachment: true });

        expect(result.needsSearch).toBe(false);
        expect(searchWeb).not.toHaveBeenCalled();
    });

    test('should search when explicitly requested even with file attached', async () => {
        // user asks to search specifically
        // Mock default behavior for shouldSearch -> YES
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => "YES" }
        });
        // And generateSearchQueries -> query
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => "google search query" }
        });

        const result = await performResearch("Search web for latest react docs and compare with this file", "", { hasFileAttachment: true });

        expect(result.needsSearch).toBe(true);
        expect(searchWeb).toHaveBeenCalled();
    });

    test('should default to search if no file attached', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => "YES" }
        });
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => "query" }
        });

        const result = await performResearch("What is the weather?");
        expect(searchWeb).toHaveBeenCalled();
    });
});
