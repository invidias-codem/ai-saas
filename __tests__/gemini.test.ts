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

    it('should strip leading model messages (Gemini requires first content to be user)', () => {
        const history: HistoryItem[] = [
            { role: 'model', parts: [{ text: 'Welcome!' }] },
            { role: 'user', parts: [{ text: 'Hi' }] },
            { role: 'model', parts: [{ text: 'How can I help?' }] }
        ];

        const { sanitizedHistory, prependToPrompt } = sanitizeHistory(history);

        // The leading model message should be stripped
        expect(sanitizedHistory).toHaveLength(2);
        expect(sanitizedHistory[0].role).toBe('user');
        expect(sanitizedHistory[1].role).toBe('model');
        // The stripped model greeting should appear in prependToPrompt
        expect(prependToPrompt).toContain('Welcome!');
    });

    it('should handle greeting-only history (model + single user message)', () => {
        // This is the exact scenario that caused the production error
        const history: HistoryItem[] = [
            { role: 'model', parts: [{ text: 'Hi! How can I help?' }] }
        ];

        const { sanitizedHistory, prependToPrompt } = sanitizeHistory(history);

        // History should be empty (model greeting stripped)
        expect(sanitizedHistory).toHaveLength(0);
        // The greeting should be folded into prepend
        expect(prependToPrompt).toContain('Hi! How can I help?');
    });
});
