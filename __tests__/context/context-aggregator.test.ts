import { gatherCodeContext } from '../../lib/llm/contextAggregator';
import { CODE_MODELS } from '../../lib/llm/codeModels';
import { ContextTokenManager } from '../../lib/context/ContextTokenManager';

jest.mock('@/lib/ragMemory', () => ({
  getRAGMemoryContext: jest.fn().mockResolvedValue({ contextString: 'mock RAG memory context\n' }),
  gatherUserContext: jest.fn().mockResolvedValue({ someUserContext: true }),
  formatUserContextForPrompt: jest.fn().mockReturnValue('mock formatted user context\n'),
  getHighConfidenceFacts: jest.fn().mockResolvedValue([{ id: 'fact_1', content: 'high confidence fact' }]),
  formatFactsForPrompt: jest.fn().mockReturnValue('mock formatted facts\n'),
  getGitHubContext: jest.fn().mockResolvedValue('mock github context\n'),
  getWorkspaceMemoryContext: jest.fn().mockResolvedValue({ contextString: 'mock workspace context', sources: [] }),
  estimateTokenCount: jest.fn().mockImplementation((text: string) => Math.ceil(text.length / 4)),
}));

jest.mock('@/lib/intelligentMemory', () => ({
  rankMemoriesIntelligently: jest.fn().mockReturnValue([{ id: 'fact_1', content: 'high confidence fact' }]),
}));

jest.mock('@/lib/memory/graphStore', () => ({
  findRelatedEntities: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
  formatGraphContext: jest.fn().mockReturnValue('mock formatted graph context\n'),
}));

jest.mock('@/lib/agents/researcher', () => ({
  performResearch: jest.fn().mockResolvedValue({ results: [] }),
  formatSearchResults: jest.fn().mockReturnValue('mock search results\n'),
}));

jest.mock('@/lib/memoryPromotion', () => ({
  getUserProfile: jest.fn().mockResolvedValue({}),
  formatUserProfileForPrompt: jest.fn().mockReturnValue('mock formatted user profile\n'),
}));

describe('gatherCodeContext integration with ContextTokenManager', () => {
  const defaultParams = {
    userId: 'user_test_aggregator',
    clerkUser: { id: 'clerk_test' },
    userQuery: 'Write a typescript interface for UcolRequestAttachment',
    resolvedContext: {
      profile: { id: 'profile_1' },
      mode: 'agentic',
      operatingProfileName: 'Standard Dev',
      workspaceId: 'workspace_123',
    },
    routingDecision: {
      intent: { category: 'code', confidence: 0.95, urgency: 'low' },
      providerPlan: { preferredModelRefs: ['agentic'] },
    },
    initialModelConfig: CODE_MODELS.quality,
  };

  test('successfully aggregates context using ContextTokenManager', async () => {
    const result = await gatherCodeContext(defaultParams);

    expect(result).toBeDefined();
    expect(result.modelConfig).toEqual(CODE_MODELS.agentic);
    expect(result.enhancedPromptText).toContain('mock formatted user context');
    expect(result.enhancedPromptText).toContain('mock formatted user profile');
    expect(result.enhancedPromptText).toContain('mock formatted facts');
    expect(result.enhancedPromptText).toContain('mock formatted graph context');
    expect(result.enhancedPromptText).toContain('mock search results');
    expect(result.enhancedPromptText).toContain('mock RAG memory context');
    expect(result.enhancedPromptText).toContain('mock workspace context');
    expect(result.enhancedPromptText).toContain('Coding Runtime Context');
  });

  test('falls back gracefully to raw concatenation if ContextTokenManager throws an error', async () => {
    // Force ContextTokenManager.assembleContext to throw
    const assembleContextSpy = jest.spyOn(ContextTokenManager, 'assembleContext').mockImplementationOnce(() => {
      throw new Error('Simulation of token manager failure');
    });

    const result = await gatherCodeContext(defaultParams);

    expect(result).toBeDefined();
    expect(result.enhancedPromptText).toContain('mock formatted user context');
    expect(result.enhancedPromptText).toContain('mock RAG memory context');
    expect(result.enhancedPromptText).toContain('Coding Runtime Context');
    
    // Ensure the spy was called
    expect(assembleContextSpy).toHaveBeenCalled();
  });
});
