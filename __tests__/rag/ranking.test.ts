
import { rankMemoriesIntelligently, ExtractedFact } from '@/lib/intelligentMemory';

describe('Intelligent Memory Ranking', () => {
    it('should rank facts by score descending', () => {
        const facts: ExtractedFact[] = [
            { id: '1', content: 'low relevance', type: 'conversation', confidence: 1.0 },
            { id: '2', content: 'high relevance', type: 'conversation', confidence: 1.0 }
        ];

        const similarities = new Map<string, number>();
        similarities.set('1', 0.1);
        similarities.set('2', 0.9);

        const ranked = rankMemoriesIntelligently(facts, similarities, 'query');

        expect(ranked.length).toBe(2);
        expect(ranked[0].id).toBe('2');
        expect(ranked[1].id).toBe('1');
        expect(ranked[0].contextRelevance).toBeGreaterThan(ranked[1].contextRelevance!);
    });

    it('should prioritize keyword matches', () => {
        const facts: ExtractedFact[] = [
            { id: '1', content: 'apple banana', type: 'conversation', confidence: 1.0 },
            { id: '2', content: 'orange grape', type: 'conversation', confidence: 1.0 }
        ];

        const similarities = new Map<string, number>();
        similarities.set('1', 0.5);
        similarities.set('2', 0.5);

        // Query matches fact 1
        const ranked = rankMemoriesIntelligently(facts, similarities, 'apple');

        expect(ranked[0].id).toBe('1');
    });

    it('should filter out zero score items effectively (if any relevance logic allows)', () => {
        // rankMemoriesIntelligently currently filters score > 0.
        // If similarity and keyword match are 0, and sentiment/importance are 0, score might be 0.
        const facts: ExtractedFact[] = [
            { id: '1', content: 'irrelevant', type: 'conversation', confidence: 0.0, impactScore: 0, userRating: 0 }
        ];
        const similarities = new Map<string, number>();
        similarities.set('1', 0);

        const ranked = rankMemoriesIntelligently(facts, similarities, 'unrelated');
        expect(ranked.length).toBe(0);
    });
});
