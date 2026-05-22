const mockDelete = jest.fn();
const mockInsert = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  }
}));

jest.mock('../lib/compression', () => ({
  compress: (str: string) => `compressed_${str}`,
  safeDecompress: (str: string) => str.replace('compressed_', ''),
}));

jest.mock('@/lib/memory/embedding', () => ({
  generateEmbeddingWithMetadata: jest.fn(),
}));

import { deleteCodeChunks, storeMemoriesBulk, searchMemories } from '../lib/memory/vectorStore';
import { supabase } from '@/lib/supabaseClient';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';

describe('Vector Store Bulk & Search isolation', () => {
  beforeEach(() => {
    console.log('TYPE OF generateEmbeddingWithMetadata:', typeof generateEmbeddingWithMetadata, generateEmbeddingWithMetadata);
    jest.clearAllMocks();
    
    (generateEmbeddingWithMetadata as any).mockResolvedValue({
      vector: [0.1, 0.2, 0.3],
      dimension: 768,
      provider: 'test-provider',
      model: 'test-model',
    });
    
    // Configure dynamic mocks on imported supabase instances
    (supabase.from as any).mockImplementation(() => ({
      delete: mockDelete,
      insert: mockInsert,
      select: mockSelect,
      eq: mockEq,
    }));

    (supabase.rpc as any).mockImplementation((...args: any[]) => mockRpc(...args));
    
    // Set up default fluent returns
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ data: [], error: null });
  });

  describe('deleteCodeChunks', () => {
    it('should query Supabase delete with proper workspaceId and path metadata containment', async () => {
      mockEq.mockReturnValue({ eq: mockEq });

      const success = await deleteCodeChunks('lib/test.ts', 'workspace-abc');

      expect(success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('memory_bank');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('type', 'code_chunk');
      expect(mockEq).toHaveBeenCalledWith('metadata->>workspaceId', 'workspace-abc');
      expect(mockEq).toHaveBeenCalledWith('metadata->>path', 'lib/test.ts');
    });
  });

  describe('storeMemoriesBulk', () => {
    it('should generate embeddings concurrently and perform bulk insert', async () => {
      mockSelect.mockReturnValue({
        data: [{ id: 'id-1' }, { id: 'id-2' }],
        error: null,
      });

      const memories = [
        { content: 'chunk one', type: 'code_chunk' as const, metadata: { path: 'file1.go' } },
        { content: 'chunk two', type: 'code_chunk' as const, metadata: { path: 'file2.go' } },
      ];

      const ids = await storeMemoriesBulk('system', memories, {
        scope: 'workspace',
        workspaceId: 'workspace-123',
      });

      expect(ids).toEqual(['id-1', 'id-2']);
      expect(mockInsert).toHaveBeenCalled();
      
      const payload = mockInsert.mock.calls[0][0];
      expect(payload.length).toBe(2);
      expect(payload[0].user_id).toBe('system');
      expect(payload[0].content).toBe('compressed_chunk one');
      expect(payload[0].metadata.workspaceId).toBe('workspace-123');
      expect(payload[0].metadata.path).toBe('file1.go');
    });
  });

  describe('searchMemories with isolation metadata filter', () => {
    it('should forward metadata_filter parameter directly to RPC', async () => {
      const mockRpcResult = {
        data: [
          {
            id: 'mem-1',
            content: 'compressed_chunk content',
            type: 'code_chunk',
            metadata: { workspaceId: 'my-workspace' },
            similarity: 0.85,
            created_at: new Date().toISOString(),
          }
        ],
        error: null,
      };
      mockRpc.mockResolvedValue(mockRpcResult);

      const results = await searchMemories(
        'system',
        'query text',
        5,
        'code_chunk',
        { workspaceId: 'my-workspace' }
      );

      expect(results.length).toBe(1);
      expect(results[0].content).toBe('chunk content');
      expect(mockRpc).toHaveBeenCalledWith('match_memories_768', expect.objectContaining({
        query_embedding: [0.1, 0.2, 0.3],
        match_count: 5,
        filter_user_id: 'system',
        filter_feature_type: 'code_chunk',
        metadata_filter: { workspaceId: 'my-workspace' },
      }));
    });
  });
});
