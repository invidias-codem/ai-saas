/**
 * Tests for the Hybrid RAG System
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

// Mock Supabase for testing
jest.mock('../lib/supabaseClient', () => ({
    supabase: {
        from: () => ({
            select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }),
            insert: () => ({ select: () => ({ single: () => ({ data: { id: 'test-id' }, error: null }) }) }),
        }),
        rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
    },
}));

describe('Rate Limiter', () => {
    let RateLimiter: any;
    let COST_ESTIMATES: any;

    beforeAll(async () => {
        const importedModule = await import('../lib/rag/rateLimiter');
        RateLimiter = importedModule.RateLimiter;
        COST_ESTIMATES = importedModule.COST_ESTIMATES;
    });

    it('should have correct cost estimates', () => {
        expect(COST_ESTIMATES.QODO_PR_REVIEW).toBe(0.10);
        expect(COST_ESTIMATES.GENIE_PR_REVIEW).toBe(0.05);
        expect(COST_ESTIMATES.CODEBASE_INDEX_PER_FILE).toBe(0.002);
        expect(COST_ESTIMATES.KNOWLEDGE_SYNC).toBe(0.01);
    });

    it('should create limiter with default budget', () => {
        const limiter = new RateLimiter();
        expect(limiter).toBeDefined();
    });

    it('should check budget correctly', async () => {
        const limiter = new RateLimiter(5.00, 0.8);
        const canProceed = await limiter.checkBudget(0.10);
        expect(canProceed).toBe(true);
    });

    it('should get current usage', async () => {
        const limiter = new RateLimiter();
        const status = await limiter.getCurrentUsage();
        expect(status).toHaveProperty('spent');
        expect(status).toHaveProperty('remaining');
        expect(status).toHaveProperty('percentUsed');
        expect(status).toHaveProperty('canProceed');
    });
});

describe('Verification Layer', () => {
    let classifySuggestions: any;
    let SAFETY_RULES: any;

    beforeAll(async () => {
        const importedModule = await import('../lib/rag/verificationLayer');
        classifySuggestions = importedModule.classifySuggestions;
        SAFETY_RULES = importedModule.SAFETY_RULES;
    });

    it('should classify formatting suggestions as safe', () => {
        const suggestions = [{
            file: 'components/Button.tsx',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'const x=1',
            suggestedCode: 'const x = 1',
            reason: 'Formatting fix',
            confidence: 0.9,
            category: 'formatting' as const,
            source: 'qodo' as const,
        }];

        const result = classifySuggestions(suggestions);
        expect(result.safe.length).toBe(1);
        expect(result.dangerous.length).toBe(0);
    });

    it('should classify auth-related changes as dangerous', () => {
        const suggestions = [{
            file: 'lib/auth/password.ts',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'const password = "123"',
            suggestedCode: 'const password = hash("123")',
            reason: 'Security fix',
            confidence: 0.9,
            category: 'security' as const,
            source: 'genie' as const,
        }];

        const result = classifySuggestions(suggestions);
        expect(result.dangerous.length).toBe(1);
        expect(result.safe.length).toBe(0);
    });

    it('should classify API route changes as requiring approval', () => {
        const suggestions = [{
            file: 'app/api/users/route.ts',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'return data',
            suggestedCode: 'return { data }',
            reason: 'Better response format',
            confidence: 0.8,
            category: 'logic' as const,
            source: 'qodo' as const,
        }];

        const result = classifySuggestions(suggestions);
        expect(result.requiresApproval.length).toBe(1);
    });

    it('should have correct dangerous patterns', () => {
        expect(SAFETY_RULES.DANGEROUS_PATTERNS.length).toBeGreaterThan(0);
        expect(SAFETY_RULES.SAFE_CATEGORIES).toContain('formatting');
        expect(SAFETY_RULES.SAFE_CATEGORIES).toContain('import');
    });
});

describe('Codebase Indexer', () => {
    let CodebaseIndexer: any;

    beforeAll(async () => {
        const importedModule = await import('../lib/rag/codebaseIndexer');
        CodebaseIndexer = importedModule.CodebaseIndexer;
    });

    it('should create indexer with default options', () => {
        const indexer = new CodebaseIndexer();
        expect(indexer).toBeDefined();
    });

    it('should have correct default exclusions', () => {
        const indexer = new CodebaseIndexer();
        // Access private property for testing
        expect(indexer['excludePatterns']).toContain('node_modules/**');
        expect(indexer['excludePatterns']).toContain('.next/**');
        expect(indexer['excludePatterns']).toContain('.venv/**');
    });

    it('should have correct default extensions', () => {
        const indexer = new CodebaseIndexer();
        expect(indexer['includeExtensions']).toContain('.ts');
        expect(indexer['includeExtensions']).toContain('.tsx');
        expect(indexer['includeExtensions']).toContain('.md');
    });
});

describe('PR Context Enricher', () => {
    let enrichPRContext: any;

    beforeAll(async () => {
        const importedModule = await import('../lib/rag/prContextEnricher');
        enrichPRContext = importedModule.enrichPRContext;
    });

    it('should return context object', async () => {
        const prData = {
            files: ['lib/test.ts'],
            diff: '',
            title: 'Test PR',
            description: 'Test description',
        };

        const context = await enrichPRContext(prData);
        expect(context).toHaveProperty('relatedPatterns');
        expect(context).toHaveProperty('relatedEntities');
        expect(context).toHaveProperty('summary');
        expect(context).toHaveProperty('codebaseInsights');
    });
});

describe('Knowledge Sync', () => {
    let syncPRInsightsToMemory: any;

    beforeAll(async () => {
        const importedModule = await import('../lib/rag/knowledgeSync');
        syncPRInsightsToMemory = importedModule.syncPRInsightsToMemory;
    });

    it('should return sync result', async () => {
        const insight = {
            prNumber: 1,
            prTitle: 'Test PR',
            author: 'testuser',
            insights: ['Test insight'],
            patterns: ['Test pattern'],
            issues: [],
            suggestions: [],
            timestamp: new Date().toISOString(),
        };

        const result = await syncPRInsightsToMemory(insight);
        expect(result).toHaveProperty('memoriesStored');
        expect(result).toHaveProperty('nodesCreated');
        expect(result).toHaveProperty('edgesCreated');
        expect(result).toHaveProperty('errors');
    });
});
