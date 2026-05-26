import { CodeModelConfig } from './types';

export const CODE_MODELS: Record<string, CodeModelConfig> = {
    fast: {
        id: 'fast',
        name: 'Fast',
        provider: 'gemini',
        modelId: 'gemini-2.5-flash',
        description: 'Fastest response time for quick iterations',
        maxTokens: 8192,
    },
    quality: {
        id: 'quality',
        name: 'Quality',
        provider: 'claude',
        modelId: 'claude-3-5-sonnet-20240620',
        description: 'Best code quality and reasoning',
        maxTokens: 8192,
    },
    agentic: {
        id: 'agentic',
        name: 'Agentic',
        provider: 'gemini',
        modelId: 'gemini-2.5-pro',
        description: 'Autonomous code execution and tool use',
        maxTokens: 8192,
        supportsCodeExecution: true,
    },
    reasoning: {
        id: 'reasoning',
        name: 'Reasoning',
        provider: 'deepseek',
        modelId: 'deepseek-r1',
        description: 'Advanced reasoning for complex problems',
        maxTokens: 32768,
    },
};
