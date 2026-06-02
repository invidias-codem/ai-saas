package harness

import (
	"bytes"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"

	// Pure Go SQLite driver (Zero-CGO)
	_ "modernc.org/sqlite"
)

// FetchEmbeddings calls the Next.js API route to batch generate embeddings via OpenAI
func FetchEmbeddings(texts []string, authToken string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	payload := map[string]interface{}{
		"texts": texts,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal embeddings payload: %w", err)
	}

	req, err := http.NewRequest("POST", "http://localhost:3000/api/harness/embeddings", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create embeddings request: %w", err)
	}
	
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch embeddings: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embeddings API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var response struct {
		Embeddings [][]float32 `json:"embeddings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode embeddings response: %w", err)
	}

	return response.Embeddings, nil
}


// VectorIndex manages the local SQLite connection for chunk storage
type VectorIndex struct {
	db *sql.DB
}

// NewVectorIndex initializes the pure-Go SQLite database and ensures the schema exists
func NewVectorIndex(dbPath string) (*VectorIndex, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// The workspace_id column is the architectural guardrail preventing cross-tenant data leaks locally
	schema := `
	CREATE TABLE IF NOT EXISTS chunks (
		id TEXT PRIMARY KEY,
		workspace_id TEXT NOT NULL,
		file_path TEXT NOT NULL,
		content TEXT NOT NULL,
		embedding BLOB NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_workspace ON chunks(workspace_id);

	CREATE TABLE IF NOT EXISTS episodic_events (
		id TEXT PRIMARY KEY,
		workspace_id TEXT NOT NULL,
		event_type TEXT NOT NULL,
		content TEXT NOT NULL,
		metadata TEXT,
		embedding BLOB NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_episodic_workspace ON episodic_events(workspace_id);
	`
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("failed to initialize vector schema: %w", err)
	}

	return &VectorIndex{db: db}, nil
}

// --- VECTOR SERIALIZATION ---

// Float32ArrayToBytes converts a slice of float32s into a LittleEndian byte array for SQLite BLOB storage
func Float32ArrayToBytes(floats []float32) []byte {
	bytes := make([]byte, len(floats)*4) // float32 is 4 bytes
	for i, f := range floats {
		bits := math.Float32bits(f)
		binary.LittleEndian.PutUint32(bytes[i*4:], bits)
	}
	return bytes
}

// BytesToFloat32Array deserializes a SQLite BLOB byte array back into a slice of float32s
func BytesToFloat32Array(bytes []byte) ([]float32, error) {
	if len(bytes)%4 != 0 {
		return nil, fmt.Errorf("invalid byte slice length: must be a multiple of 4")
	}
	floats := make([]float32, len(bytes)/4)
	for i := range floats {
		bits := binary.LittleEndian.Uint32(bytes[i*4:])
		floats[i] = math.Float32frombits(bits)
	}
	return floats, nil
}

// --- VECTOR MATH ---

// CosineSimilarity computes the distance between two 1536d vectors.
// This is highly optimized for a single-pass loop over the dimensions.
func CosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}

	var dotProduct, normA, normB float32
	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	// Calculate the magnitudes
	magnitudeA := float32(math.Sqrt(float64(normA)))
	magnitudeB := float32(math.Sqrt(float64(normB)))

	return dotProduct / (magnitudeA * magnitudeB)
}

// InsertChunks batches the insertion of chunked file content and embeddings into SQLite.
func (vi *VectorIndex) InsertChunks(workspaceId string, filePath string, chunks []string, embeddings [][]float32) error {
	if len(chunks) != len(embeddings) {
		return fmt.Errorf("mismatch between chunks length (%d) and embeddings length (%d)", len(chunks), len(embeddings))
	}

	tx, err := vi.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("INSERT OR REPLACE INTO chunks (id, workspace_id, file_path, content, embedding) VALUES (?, ?, ?, ?, ?)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i := range chunks {
		chunkId := fmt.Sprintf("%s_%s_%d", workspaceId, filePath, i)
		blob := Float32ArrayToBytes(embeddings[i])

		if _, err := stmt.Exec(chunkId, workspaceId, filePath, chunks[i], blob); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// DeleteFileChunks removes all existing chunks for a given file in a workspace.
// This is used to ensure idempotent updates when a file is modified and re-ingested.
func (vi *VectorIndex) DeleteFileChunks(workspaceId string, filePath string) error {
	_, err := vi.db.Exec("DELETE FROM chunks WHERE workspace_id = ? AND file_path = ?", workspaceId, filePath)
	return err
}

// GetWorkspaceFiles retrieves a list of all unique file paths currently indexed for a given workspace.
func (vi *VectorIndex) GetWorkspaceFiles(workspaceId string) ([]string, error) {
	rows, err := vi.db.Query("SELECT DISTINCT file_path FROM chunks WHERE workspace_id = ?", workspaceId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []string
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, err
		}
		files = append(files, path)
	}
	return files, nil
}

// SearchResult represents a single ranked search result
type SearchResult struct {
	FilePath   string
	Content    string
	Similarity float32
}

// Search performs a pure-Go in-memory cosine similarity search against the authorized workspace.
func (vi *VectorIndex) Search(workspaceId string, queryEmbedding []float32, topK int) ([]SearchResult, error) {
	// We only query rows for the exact workspaceId to prevent cross-tenant data leaks.
	rows, err := vi.db.Query("SELECT file_path, content, embedding FROM chunks WHERE workspace_id = ?", workspaceId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []SearchResult

	for rows.Next() {
		var filePath, content string
		var blob []byte
		if err := rows.Scan(&filePath, &content, &blob); err != nil {
			return nil, err
		}

		dbEmbedding, err := BytesToFloat32Array(blob)
		if err != nil {
			continue // skip invalid blobs
		}

		sim := CosineSimilarity(queryEmbedding, dbEmbedding)
		results = append(results, SearchResult{
			FilePath:   filePath,
			Content:    content,
			Similarity: sim,
		})
	}

	// Sort results by similarity descending
	for i := 0; i < len(results)-1; i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Similarity > results[i].Similarity {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	if len(results) > topK {
		return results[:topK], nil
	}
	return results, nil
}

// --- EPISODIC MEMORY ---

type EpisodicEvent struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	EventType   string `json:"event_type"`
	Content     string `json:"content"`
	Metadata    string `json:"metadata"`
	CreatedAt   string `json:"created_at"`
}

type EpisodicSearchResult struct {
	Event      EpisodicEvent `json:"event"`
	Similarity float32       `json:"similarity"`
}

func (vi *VectorIndex) InsertEpisodicEvent(workspaceID, eventType, content, metadata string, embedding []float32) error {
	id := fmt.Sprintf("ep_%d_%d", time.Now().UnixNano(), len(content))
	blob := Float32ArrayToBytes(embedding)

	_, err := vi.db.Exec(`
		INSERT INTO episodic_events (id, workspace_id, event_type, content, metadata, embedding)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, workspaceID, eventType, content, metadata, blob)

	return err
}

func (vi *VectorIndex) SearchEpisodicEvents(workspaceID string, queryEmbedding []float32, topK int) ([]EpisodicSearchResult, error) {
	rows, err := vi.db.Query(`
		SELECT id, event_type, content, metadata, created_at, embedding 
		FROM episodic_events 
		WHERE workspace_id = ?
	`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("failed to query episodic events: %w", err)
	}
	defer rows.Close()

	var results []EpisodicSearchResult

	for rows.Next() {
		var id, eventType, content, metadata, createdAt string
		var blob []byte
		if err := rows.Scan(&id, &eventType, &content, &metadata, &createdAt, &blob); err != nil {
			continue
		}

		dbEmbedding, err := BytesToFloat32Array(blob)
		if err != nil || len(dbEmbedding) == 0 {
			continue
		}

		sim := CosineSimilarity(queryEmbedding, dbEmbedding)
		results = append(results, EpisodicSearchResult{
			Event: EpisodicEvent{
				ID:          id,
				WorkspaceID: workspaceID,
				EventType:   eventType,
				Content:     content,
				Metadata:    metadata,
				CreatedAt:   createdAt,
			},
			Similarity: sim,
		})
	}

	// Sort results by similarity descending
	for i := 0; i < len(results)-1; i++ {
		for j := i + 1; j < len(results); j++ {
			if results[j].Similarity > results[i].Similarity {
				results[i], results[j] = results[j], results[i]
			}
		}
	}

	if len(results) > topK {
		return results[:topK], nil
	}
	return results, nil
}


