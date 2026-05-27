import { searchCodebaseTool } from '../../../lib/agents/tools/searchCodebase';
import { searchMemories } from '@/lib/memory/vectorStore';

// Mock vectorStore searchMemories as an ES module named export
jest.mock('@/lib/memory/vectorStore', () => ({
    __esModule: true,
    searchMemories: jest.fn(),
    storeMemory: jest.fn(),
    listMemories: jest.fn(),
    getMemoryStats: jest.fn(),
    getMemoryCount: jest.fn(),
    deleteMemory: jest.fn(),
    updateMemory: jest.fn(),
}));

describe('Search Codebase Tool', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should validate inputs conforming to schema', () => {
        const resultEmpty = searchCodebaseTool.schema.safeParse({});
        expect(resultEmpty.success).toBe(false);

        const resultValid = searchCodebaseTool.schema.safeParse({
            query: 'how does auth work',
            limit: 3
        });
        expect(resultValid.success).toBe(true);
    });

    it('should execute similarity search under system user and code_chunk filter', async () => {
        const mockedSearchMemories = searchMemories as jest.MockedFunction<typeof searchMemories>;
        mockedSearchMemories.mockResolvedValue([
            {
                id: 'mem-1',
                userId: 'system',
                content: 'export class LocalIOHarness {}',
                type: 'code_chunk',
                createdAt: new Date().toISOString(),
                similarity: 0.88,
                metadata: {
                    path: 'lib/harness/LocalIOHarness.ts',
                    logicalName: 'LocalIOHarness',
                    chunkType: 'class',
                    startLine: 10,
                    endLine: 40,
                    dependencies: ['fs', 'path']
                }
            }
        ]);

        const context = {
            id: 'conv-id',
            mode: 'agentic',
            messages: []
        } as any;

        const result = await searchCodebaseTool.execute(
            { query: 'LocalIOHarness implementation', limit: 3 },
            context
        );

        expect(result.success).toBe(true);
        expect(mockedSearchMemories).toHaveBeenCalledWith(
            'system',
            'LocalIOHarness implementation',
            3,
            'code_chunk',
            { workspaceId: expect.any(String) }
        );

        const data = (result as any).data;
        expect(data.chunks.length).toBe(1);
        expect(data.chunks[0]).toEqual({
            matchIndex: 1,
            filePath: 'lib/harness/LocalIOHarness.ts',
            logicalName: 'LocalIOHarness',
            chunkType: 'class',
            lineRange: '10-40',
            similarity: 0.88,
            dependencies: ['fs', 'path'],
            code: 'export class LocalIOHarness {}'
        });
    });

    it('should handle empty results gracefully', async () => {
        const mockedSearchMemories = searchMemories as jest.MockedFunction<typeof searchMemories>;
        mockedSearchMemories.mockResolvedValue([]);

        const context = {} as any;
        const result = await searchCodebaseTool.execute(
            { query: 'unrelated search' },
            context
        );

        expect(result.success).toBe(true);
        expect((result as any).data.chunks.length).toBe(0);
        expect((result as any).data.message).toContain('No matching codebase chunks found');
    });
});
