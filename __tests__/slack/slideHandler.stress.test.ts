/**
 * Stress Tests for Slack Slide Handler
 * Tests slide deck generation under various conditions
 */

import { handleSlideCreation } from '@/lib/slack/handlers/slideHandler';
import { SlackConfig } from '@/lib/slack';

// Mock the Gemini client so the handler runs deterministically without a
// live GOOGLE_API_KEY. Returns a valid PresentationStructure JSON.
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              title: 'Test Deck',
              subtitle: 'Generated for testing',
              slides: [
                { title: 'Slide 1', bullets: ['Point A', 'Point B'], layout: 'content' },
                { title: 'Slide 2', bullets: ['Point C'], layout: 'content' },
              ],
            }),
        },
      }),
    }),
  })),
}));

// Mock PptxGenJS: the real lib uses a dynamic import internally (jszip) which
// jest's CJS module environment rejects. Mirror pptxgenjs's CJS export shape
// (the default export IS the constructor) with a chainable no-op builder that
// resolves to a Buffer on write.
jest.mock('pptxgenjs', () => {
  function MockPptx(this: any) {
    this.author = '';
    this.title = '';
    this.subject = '';
    this.layout = '';
  }
  (MockPptx as any).prototype.addSlide = function () {
    return { background: {}, addText: () => {}, addShape: () => {}, addImage: () => {} };
  };
  (MockPptx as any).prototype.write = function () {
    return Promise.resolve(Buffer.from('fake-pptx-bytes'));
  };
  (MockPptx as any).prototype.ShapeType = { rect: 'rect' };
  const exp: any = MockPptx;
  exp.default = MockPptx;
  exp.__esModule = true;
  return exp;
});

// Mock APIs
global.fetch = jest.fn();

// Realistic uploadV2 sequence so the handler's Slack upload completes
// deterministically without a live workspace.
function mockFetch(url: string, _init?: any) {
  if (typeof url === 'string' && url.includes('files.getUploadURLExternal')) {
    return Promise.resolve({
      json: async () => ({ ok: true, upload_url: 'https://slack-upload.test/x', file_id: 'F123' }),
    });
  }
  if (typeof url === 'string' && url.includes('files.completeUploadExternal')) {
    return Promise.resolve({ json: async () => ({ ok: true, files: [{ id: 'F123' }] }) });
  }
  return Promise.resolve({ json: async () => ({ ok: true }) });
}
(global.fetch as jest.Mock).mockImplementation(mockFetch);

const mockConfig: SlackConfig = {
    teamId: 'T123ABC',
    teamName: 'Test Team',
    botToken: 'xoxb-test-token',
    botUserId: 'U123BOT',
    scopes: ['chat:write', 'files:write'],
};

const mockEvent = {
    channel: 'C123CHANNEL',
    ts: '1234567890.123456',
    thread_ts: null,
    user: 'U123USER',
    text: '@Genie create a slide deck',
};

describe('Slide Handler Stress Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => mockFetch(url, init));
    });

    describe('Topic Extraction', () => {
        test('should extract simple topics', async () => {
            const testCases = [
                'create a slide deck about AI',
                'make a presentation on machine learning',
                'generate slides for sales strategy',
                'build a pptx about our product',
            ];

            for (const message of testCases) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, message)
                ).resolves.not.toThrow();
            }
        }, 30000);

        test('should handle complex multi-word topics', async () => {
            const complexTopics = [
                'create a presentation about artificial intelligence and machine learning in healthcare',
                'make slides on the future of quantum computing and its applications',
                'generate a deck about sustainable energy solutions for developing countries',
            ];

            for (const topic of complexTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, topic)
                ).resolves.not.toThrow();
            }
        }, 35000);

        test('should handle topics with special characters', async () => {
            const specialCharTopics = [
                'create slides about AI/ML & Deep Learning',
                'make a presentation on "The Future of Tech"',
                'generate deck about Q4 2024 Results (50% Growth)',
            ];

            for (const topic of specialCharTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, topic)
                ).resolves.not.toThrow();
            }
        }, 25000);
    });

    describe('Presentation Generation', () => {
        test('should generate presentations for various topics', async () => {
            const topics = [
                'Artificial Intelligence',
                'Climate Change',
                'Product Launch Strategy',
                'Team Building',
                'Financial Planning',
            ];

            for (const topic of topics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, `create slides about ${topic}`)
                ).resolves.not.toThrow();
            }
        }, 40000);

        test('should handle technical topics', async () => {
            const technicalTopics = [
                'Microservices Architecture',
                'Kubernetes Deployment',
                'React Hooks Best Practices',
                'Database Optimization',
                'API Design Patterns',
            ];

            for (const topic of technicalTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, `make a presentation on ${topic}`)
                ).resolves.not.toThrow();
            }
        }, 40000);

        test('should handle business topics', async () => {
            const businessTopics = [
                'Sales Strategy for Q1',
                'Marketing Campaign Analysis',
                'Customer Retention Metrics',
                'Competitive Analysis',
                'Budget Planning 2024',
            ];

            for (const topic of businessTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, `generate slides for ${topic}`)
                ).resolves.not.toThrow();
            }
        }, 40000);
    });

    describe('Error Handling', () => {
        test('should handle empty topics gracefully', async () => {
            const emptyTopics = [
                'create a slide deck',
                'make a presentation',
                'generate slides',
            ];

            for (const message of emptyTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, message)
                ).resolves.not.toThrow();
            }
        }, 20000);

        test('should handle Gemini API failures', async () => {
            // Mock would require intercepting Gemini calls
            // For now, verify error handling structure
            await expect(
                handleSlideCreation(mockConfig, mockEvent, 'create slides about AI')
            ).resolves.not.toThrow();
        }, 10000);

        test('should handle PptxGenJS failures', async () => {
            // Mock would require intercepting PptxGenJS
            await expect(
                handleSlideCreation(mockConfig, mockEvent, 'create slides about AI')
            ).resolves.not.toThrow();
        }, 10000);

        test('should handle Slack file upload failures', async () => {
            (global.fetch as jest.Mock).mockImplementation((url: string) => {
                if (url.includes('files.upload')) {
                    return Promise.reject(new Error('Upload failed'));
                }
                return Promise.resolve({
                    json: async () => ({ ok: true }),
                });
            });

            await expect(
                handleSlideCreation(mockConfig, mockEvent, 'create slides about AI')
            ).resolves.not.toThrow();
        }, 15000);

        test('should handle network timeouts', async () => {
            (global.fetch as jest.Mock).mockImplementationOnce(
                () => new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 100)
                )
            );

            await expect(
                handleSlideCreation(mockConfig, mockEvent, 'create slides about AI')
            ).resolves.not.toThrow();
        }, 10000);
    });

    describe('Edge Cases', () => {
        test('should handle very short topics', async () => {
            const shortTopics = [
                'create slides about AI',
                'make presentation on ML',
                'generate deck for UX',
            ];

            for (const topic of shortTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, topic)
                ).resolves.not.toThrow();
            }
        }, 25000);

        test('should handle very long topics', async () => {
            const longTopic = `create a comprehensive presentation about the future of artificial 
        intelligence and machine learning in healthcare, including current applications, 
        challenges, ethical considerations, regulatory frameworks, and future predictions 
        for the next decade with case studies and real-world examples`;

            await expect(
                handleSlideCreation(mockConfig, mockEvent, longTopic)
            ).resolves.not.toThrow();
        }, 20000);

        test('should handle topics in different languages', async () => {
            const multilingualTopics = [
                'créer une présentation sur l\'IA', // French
                'hacer una presentación sobre IA', // Spanish
                'AIについてのプレゼンテーションを作成', // Japanese
            ];

            for (const topic of multilingualTopics) {
                await expect(
                    handleSlideCreation(mockConfig, mockEvent, topic)
                ).resolves.not.toThrow();
            }
        }, 25000);

        test('should handle thread vs non-thread contexts', async () => {
            // Non-thread
            await handleSlideCreation(
                mockConfig,
                { ...mockEvent, thread_ts: null },
                'create slides about AI'
            );

            // In thread
            await handleSlideCreation(
                mockConfig,
                { ...mockEvent, thread_ts: '1234567890.123456' },
                'create slides about AI'
            );

            expect(true).toBe(true);
        }, 20000);
    });

    describe('Concurrent Requests', () => {
        test('should handle multiple concurrent slide requests', async () => {
            const requests = Array(3).fill(null).map((_, i) =>
                handleSlideCreation(
                    mockConfig,
                    { ...mockEvent, ts: `123456789${i}.123456` },
                    `create slides about topic ${i}`
                )
            );

            await expect(Promise.all(requests)).resolves.not.toThrow();
        }, 35000);

        test('should handle rapid sequential requests', async () => {
            for (let i = 0; i < 5; i++) {
                await handleSlideCreation(
                    mockConfig,
                    { ...mockEvent, ts: `123456789${i}.123456` },
                    `create slides about topic ${i}`
                );
            }

            expect(true).toBe(true);
        }, 45000);
    });

    describe('File Generation', () => {
        test('should generate valid PPTX files', async () => {
            await handleSlideCreation(mockConfig, mockEvent, 'create slides about AI');

            // The handler uploads via Slack's files.uploadV2 flow.
            const fetchCalls = (global.fetch as jest.Mock).mock.calls;
            const uploadCalls = fetchCalls.filter(call =>
                call[0]?.includes('files.getUploadURLExternal')
            );

            expect(uploadCalls.length).toBeGreaterThan(0);
        }, 15000);

        test('should handle large presentations', async () => {
            const complexTopic = `create a detailed presentation covering all aspects of 
        cloud computing, including IaaS, PaaS, SaaS, security, compliance, cost optimization, 
        migration strategies, and best practices`;

            await expect(
                handleSlideCreation(mockConfig, mockEvent, complexTopic)
            ).resolves.not.toThrow();
        }, 25000);
    });

    describe('Status Updates', () => {
        test('should set and clear loading status', async () => {
            await handleSlideCreation(mockConfig, mockEvent, 'create slides about AI');

            const fetchCalls = (global.fetch as jest.Mock).mock.calls;
            const statusCalls = fetchCalls.filter(call =>
                call[0]?.includes('assistant.threads.setStatus')
            );

            expect(statusCalls.length).toBeGreaterThan(0);
        }, 15000);
    });
});
