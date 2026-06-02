package harness

import (
	"os"
	"testing"
)

func TestVectorIndex_InsertAndSearch(t *testing.T) {
	// 1. Setup temporary DB
	dbPath := "test_lattice_vectors.db"
	defer os.Remove(dbPath)

	vi, err := NewVectorIndex(dbPath)
	if err != nil {
		t.Fatalf("Failed to initialize vector index: %v", err)
	}

	workspaceId := "test_workspace_1"
	filePath := "test_file.go"
	
	// Mock chunks
	chunks := []string{
		"func Hello() {}",
		"func World() {}",
	}

	// Mock embeddings (1536 dims)
	embeddings := make([][]float32, 2)
	embeddings[0] = make([]float32, 1536)
	embeddings[0][0] = 1.0 // Hello
	embeddings[1] = make([]float32, 1536)
	embeddings[1][1] = 1.0 // World

	// 2. Insert
	err = vi.InsertChunks(workspaceId, filePath, chunks, embeddings)
	if err != nil {
		t.Fatalf("Failed to insert chunks: %v", err)
	}

	// 3. Search
	queryEmbedding := make([]float32, 1536)
	queryEmbedding[0] = 0.9 // Close to Hello

	results, err := vi.Search(workspaceId, queryEmbedding, 5)
	if err != nil {
		t.Fatalf("Failed to search: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("Expected 2 results, got %d", len(results))
	}

	if results[0].Content != "func Hello() {}" {
		t.Errorf("Expected 'func Hello() {}' as top result, got '%s'", results[0].Content)
	}
}
