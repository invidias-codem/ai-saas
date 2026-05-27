import { compress, decompress, compressObject, decompressObject } from "../lib/compression";
import { storeMemory, searchMemories } from "../lib/memory/vectorStore";
import { generateEmbedding } from "../lib/memory/embedding";

// Mock dependencies
jest.mock("../lib/memory/embedding", () => ({
    generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
    generateEmbeddingWithMetadata: jest.fn().mockResolvedValue({
        vector: new Array(768).fill(0.1),
        dimension: 768,
        provider: 'test-provider',
        model: 'test-model',
    }),
}));

jest.mock("../lib/supabaseClient", () => ({
    supabase: {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: "mock-memory-id" }, error: null }),
        rpc: jest.fn().mockImplementation((fnName, args) => {
            if (fnName.startsWith('match_memories')) {
                // Mock returning a compressed memory
                const content = "This is a test memory for compression.";
                const compressed = compress(content);
                return Promise.resolve({
                    data: [{
                        id: "mock-memory-id",
                        content: compressed, // Return compressed content
                        type: "conversation_summary",
                        metadata: {},
                        similarity: 0.9,
                        created_at: new Date().toISOString()
                    }],
                    error: null
                });
            }
            return Promise.resolve({ data: [], error: null });
        })
    }
}));

describe("Compression Tests", () => {
    test("String compression and decompression", () => {
        const original = "This is a test string for compression verification.";
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed).toBe(original);
        expect(compressed).not.toBe(original);
        expect(compressed.length).toBeLessThan(original.length); // Assuming string is long enough to compress
    });

    test("Object compression and decompression", () => {
        const obj = [{ role: "user", text: "Hello" }, { role: "bot", text: "Hi" }];
        const compressed = compressObject(obj);
        const decompressed = decompressObject(compressed);

        expect(decompressed).toEqual(obj);
    });

    test("Decompression handles uncompressed legacy data", () => {
        const legacy = "This is legacy uncompressed text.";
        const result = decompress(legacy);
        expect(result).toBe(legacy);
    });
});

describe("Storage Integration Tests", () => {
    test("searchMemories decompresses content", async () => {
        const results = await searchMemories("user-123", "test query");
        expect(results.length).toBe(1);
        expect(results[0].content).toBe("This is a test memory for compression.");
    });
});
