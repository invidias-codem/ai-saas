import { sanitizeHistory, HistoryItem } from '../lib/gemini';

describe('sanitizeHistory', () => {
    it('should merge consecutive user messages', () => {
        const history: HistoryItem[] = [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'user', parts: [{ text: 'World' }] },
            { role: 'model', parts: [{ text: 'Hi there' }] }
        ];

        const { sanitizedHistory } = sanitizeHistory(history);

        expect(sanitizedHistory).toHaveLength(2);
        expect(sanitizedHistory[0].role).toBe('user');
        expect(sanitizedHistory[0].parts[0].text).toBe('Hello\n\nWorld');
        expect(sanitizedHistory[1].role).toBe('model');
    });

    it('should merge consecutive model messages', () => {
        const history: HistoryItem[] = [
            { role: 'user', parts: [{ text: 'Hi' }] },
            { role: 'model', parts: [{ text: 'Part 1' }] },
            { role: 'model', parts: [{ text: 'Part 2' }] }
        ];

        const { sanitizedHistory, prependToPrompt } = sanitizeHistory(history);

        expect(sanitizedHistory).toHaveLength(2);
        expect(sanitizedHistory[1].role).toBe('model');
        expect(sanitizedHistory[1].parts[0].text).toBe('Part 1\n\nPart 2');
        expect(prependToPrompt).toBe('');
    });

    it('should pop the last user message to prependToPrompt', () => {
        const history: HistoryItem[] = [
            { role: 'user', parts: [{ text: 'Hi' }] },
            { role: 'model', parts: [{ text: 'Hello' }] },
            { role: 'user', parts: [{ text: 'My follow up' }] }
        ];

        const { sanitizedHistory, prependToPrompt } = sanitizeHistory(history);

        expect(sanitizedHistory).toHaveLength(2);
        expect(sanitizedHistory[1].role).toBe('model');
        expect(prependToPrompt).toBe('My follow up');
    });

    it('should handle complex mixed cases', () => {
        const history: HistoryItem[] = [
            { role: 'user', parts: [{ text: 'One' }] },
            { role: 'user', parts: [{ text: 'Two' }] },
            { role: 'model', parts: [{ text: 'Response' }] },
            { role: 'user', parts: [{ text: 'Three' }] },
            { role: 'user', parts: [{ text: 'Four' }] }
        ];

        const { sanitizedHistory, prependToPrompt } = sanitizeHistory(history);

        expect(sanitizedHistory).toHaveLength(2);
        // Correctly merged One + Two
        expect(sanitizedHistory[0].role).toBe('user');
        expect(sanitizedHistory[0].parts[0].text).toBe('One\n\nTwo');

        // Model response
        expect(sanitizedHistory[1].role).toBe('model');

        // Popped and merged Three + Four
        expect(prependToPrompt).toBe('Three\n\nFour');
    });
});
