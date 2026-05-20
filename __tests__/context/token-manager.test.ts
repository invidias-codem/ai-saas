import { ContextTokenManager } from '../../lib/context/ContextTokenManager';
import { PreparedContextSections } from '../../lib/context/types';

describe('ContextTokenManager', () => {
  describe('getModelLimits', () => {
    test('returns correct limits for gemini-1.5-pro', () => {
      const limits = ContextTokenManager.getModelLimits('gemini-1.5-pro');
      expect(limits.totalMax).toBe(200000);
      expect(limits.historyReserve).toBe(40000);
      expect(limits.retrievedReserve).toBe(120000);
      expect(limits.systemReserve).toBe(8000);
    });

    test('returns correct limits for claude', () => {
      const limits = ContextTokenManager.getModelLimits('claude-3-5-sonnet');
      expect(limits.totalMax).toBe(96000);
      expect(limits.historyReserve).toBe(24000);
      expect(limits.retrievedReserve).toBe(48000);
      expect(limits.systemReserve).toBe(4000);
    });

    test('returns correct limits for deepseek', () => {
      const limits = ContextTokenManager.getModelLimits('deepseek-chat');
      expect(limits.totalMax).toBe(32000);
      expect(limits.historyReserve).toBe(8000);
      expect(limits.systemReserve).toBe(3000);
    });

    test('falls back gracefully to standard limits', () => {
      const limits = ContextTokenManager.getModelLimits('unknown-model');
      expect(limits.totalMax).toBe(32000);
      expect(limits.historyReserve).toBe(8000);
    });
  });

  describe('detectUserIntent', () => {
    test('detects code intent correctly', () => {
      expect(ContextTokenManager.detectUserIntent('please refactor this function in typescript')).toBe('code');
      expect(ContextTokenManager.detectUserIntent('how to write a postgres migration schema')).toBe('code');
    });

    test('detects search intent correctly', () => {
      expect(ContextTokenManager.detectUserIntent('what are the latest trends on bluesky today?')).toBe('search');
      expect(ContextTokenManager.detectUserIntent('crawl google for recent news')).toBe('search');
    });

    test('defaults to general intent', () => {
      expect(ContextTokenManager.detectUserIntent('hello there, how are you?')).toBe('general');
      expect(ContextTokenManager.detectUserIntent('')).toBe('general');
    });
  });

  describe('assembleContext', () => {
    const mockSections: PreparedContextSections = {
      userContextPrompt: 'User custom context prompt',
      userProfileContext: 'User is a senior engineer',
      factContext: 'Fact: Weaver is a virtual social assistant',
      graphContext: 'Weaver -> social -> agent',
      searchContext: 'Bluesky has 20M users',
      memoryContext: 'Past interaction memory: code fixed',
    };

    test('allocates and packs sections correctly when within budget', () => {
      const result = ContextTokenManager.assembleContext(
        'You are Weaver, a high-utility social assistant.',
        mockSections,
        {
          modelId: 'gemini-1.5-pro',
          userQuery: 'What are you?',
        }
      );

      expect(result.allocatedSections.length).toBeGreaterThan(0);
      expect(result.omittedSections).toHaveLength(0);
      expect(result.packedContext).toContain('=== User Context ===');
      expect(result.packedContext).toContain('=== User Profile ===');
      expect(result.packedContext).toContain('=== Fact Context ===');
      expect(result.packedContext).toContain('=== Graph Context ===');
      expect(result.packedContext).toContain('=== Search Context ===');
      expect(result.packedContext).toContain('=== Memory Context ===');
    });

    test('filters out empty or missing sections', () => {
      const emptySections: PreparedContextSections = {
        userContextPrompt: '',
        userProfileContext: '  ',
        factContext: 'Some fact',
      };

      const result = ContextTokenManager.assembleContext('System instruction', emptySections, {
        modelId: 'gemini-1.5-pro',
        userQuery: 'Query',
      });

      expect(result.allocatedSections).toHaveLength(1);
      expect(result.allocatedSections[0].key).toBe('factContext');
    });

    test('handles strict custom budget constraints by omitting or compacting sections', () => {
      const largeSections: PreparedContextSections = {
        userContextPrompt: 'User context',
        memoryContext: 'Code line '.repeat(1000), // ~2000 tokens
        searchContext: 'Search result '.repeat(1000), // ~2000 tokens
      };

      const result = ContextTokenManager.assembleContext('System', largeSections, {
        modelId: 'deepseek-chat',
        userQuery: 'Find codes',
        customBudget: 1000, // Very small token budget
      });

      // Since the budget is extremely small (1000 tokens), some sections should be omitted or compacted.
      expect(result.totalAllocatedTokens).toBeLessThanOrEqual(1000);
      expect(result.omittedSections.length + result.allocatedSections.length).toBe(3);
    });
  });
});
