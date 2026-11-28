/**
 * Stress Tests for Slack Intent Router
 * Tests intent classification under various conditions
 */

import { classifyIntent, UserIntent } from '@/lib/slack/intentRouter';

describe.skip('Intent Router Stress Tests', () => {
    describe('Intent Classification Accuracy', () => {
        test('should classify clear image requests', async () => {
            const testCases = [
                'generate an image of a cat',
                'create a picture of a sunset',
                'make me a logo for my startup',
                'draw a futuristic city',
                'design an icon for my app',
                'I need a photo of mountains',
            ];

            for (const message of testCases) {
                const result = await classifyIntent(message);
                expect(result.intent).toBe('IMAGE');
                expect(result.confidence).toBeGreaterThan(0.7);
            }
        }, 30000);

        test('should classify clear slide requests', async () => {
            const testCases = [
                'create a slide deck about AI',
                'make a presentation on machine learning',
                'generate a PowerPoint about sales strategy',
                'build slides for my pitch',
                'I need a pptx about our product',
            ];

            for (const message of testCases) {
                const result = await classifyIntent(message);
                expect(result.intent).toBe('SLIDES');
                expect(result.confidence).toBeGreaterThan(0.7);
            }
        }, 30000);

        test('should classify clear calendar requests', async () => {
            const testCases = [
                'schedule a meeting with john@example.com tomorrow at 2pm',
                'create a calendar event for team sync next Monday at 10am',
                'set up a meeting with @alice on Friday',
                'book a 1-on-1 with my manager next week',
            ];

            for (const message of testCases) {
                const result = await classifyIntent(message);
                expect(result.intent).toBe('CALENDAR');
                expect(result.confidence).toBeGreaterThan(0.7);
            }
        }, 30000);

        test('should classify chat/code requests', async () => {
            const testCases = [
                'what is the weather today?',
                'explain how React hooks work',
                'write a function to sort an array',
                'help me debug this code',
                'what are the best practices for TypeScript?',
            ];

            for (const message of testCases) {
                const result = await classifyIntent(message);
                expect(result.intent).toBe('CHAT');
            }
        }, 30000);
    });

    describe('Ambiguous Intent Handling', () => {
        test('should handle ambiguous requests with lower confidence', async () => {
            const ambiguousCases = [
                'create something cool',
                'help me with my presentation',
                'I need to visualize this data',
                'can you help with the meeting?',
            ];

            for (const message of ambiguousCases) {
                const result = await classifyIntent(message);
                // Should still classify but with lower confidence
                expect(result.confidence).toBeLessThan(0.9);
            }
        }, 30000);

        test('should handle multi-intent requests', async () => {
            const multiIntentCases = [
                'create an image and a slide deck about AI',
                'generate a logo and schedule a meeting to review it',
                'make slides and book a presentation time',
            ];

            for (const message of multiIntentCases) {
                const result = await classifyIntent(message);
                // Should pick the primary intent
                expect(['IMAGE', 'SLIDES', 'CALENDAR']).toContain(result.intent);
            }
        }, 30000);
    });

    describe('Edge Cases', () => {
        test('should handle very short messages', async () => {
            const shortMessages = [
                'image',
                'slides',
                'meeting',
                'help',
            ];

            for (const message of shortMessages) {
                const result = await classifyIntent(message);
                expect(result).toHaveProperty('intent');
                expect(result).toHaveProperty('confidence');
            }
        }, 20000);

        test('should handle very long messages', async () => {
            const longMessage = `I need you to create a comprehensive presentation about artificial intelligence 
        that covers machine learning, deep learning, neural networks, natural language processing, 
        computer vision, and all the latest developments in the field. The presentation should be 
        professional and suitable for a technical audience with detailed explanations and examples.`;

            const result = await classifyIntent(longMessage);
            expect(result.intent).toBe('SLIDES');
        }, 15000);

        test('should handle messages with special characters', async () => {
            const specialCharMessages = [
                'generate an image of a cat 🐱',
                'create slides about AI/ML & DL',
                'schedule meeting @ 2pm w/ john@example.com',
            ];

            for (const message of specialCharMessages) {
                const result = await classifyIntent(message);
                expect(result).toHaveProperty('intent');
            }
        }, 20000);

        test('should handle empty or whitespace messages', async () => {
            const emptyMessages = ['', '   ', '\n\n', '\t'];

            for (const message of emptyMessages) {
                const result = await classifyIntent(message);
                // Should default to CHAT with low confidence
                expect(result.intent).toBe('CHAT');
                expect(result.confidence).toBeLessThan(0.6);
            }
        }, 15000);
    });

    describe('Performance Tests', () => {
        test('should classify 10 requests in under 30 seconds', async () => {
            const messages = [
                'generate an image of a cat',
                'create a slide deck about AI',
                'schedule a meeting tomorrow',
                'what is TypeScript?',
                'make a logo',
                'build a presentation',
                'book a calendar event',
                'explain React',
                'draw a picture',
                'create slides',
            ];

            const startTime = Date.now();

            const results = await Promise.all(
                messages.map(msg => classifyIntent(msg))
            );

            const duration = Date.now() - startTime;

            expect(results).toHaveLength(10);
            expect(duration).toBeLessThan(30000);

            // All should have valid classifications
            results.forEach(result => {
                expect(['IMAGE', 'SLIDES', 'CALENDAR', 'CHAT']).toContain(result.intent);
            });
        }, 35000);

        test('should handle concurrent requests without errors', async () => {
            const message = 'generate an image of a sunset';

            // Fire 5 concurrent requests
            const promises = Array(5).fill(null).map(() => classifyIntent(message));

            const results = await Promise.all(promises);

            // All should succeed with same intent
            results.forEach(result => {
                expect(result.intent).toBe('IMAGE');
            });
        }, 20000);
    });

    describe('Extracted Information Validation', () => {
        test('should extract image prompts correctly', async () => {
            const message = 'generate an image of a futuristic city at sunset';
            const result = await classifyIntent(message);

            expect(result.intent).toBe('IMAGE');
            expect(result.extractedInfo?.imagePrompt).toBeTruthy();
            expect(result.extractedInfo?.imagePrompt).toContain('futuristic city');
        }, 10000);

        test('should extract slide topics correctly', async () => {
            const message = 'create a presentation about machine learning';
            const result = await classifyIntent(message);

            expect(result.intent).toBe('SLIDES');
            expect(result.extractedInfo?.slideTopic).toBeTruthy();
            expect(result.extractedInfo?.slideTopic?.toLowerCase()).toContain('machine learning');
        }, 10000);

        test('should extract meeting details correctly', async () => {
            const message = 'schedule a meeting with john@example.com tomorrow at 2pm';
            const result = await classifyIntent(message);

            expect(result.intent).toBe('CALENDAR');
            expect(result.extractedInfo?.meetingDetails).toBeTruthy();
            expect(result.extractedInfo?.meetingDetails?.attendees).toContain('john@example.com');
        }, 10000);
    });
});
