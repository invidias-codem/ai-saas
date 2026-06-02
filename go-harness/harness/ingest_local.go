package harness

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

const IngestionBatchSize = 1000 // chunks per embedding API request

// StartWorkspaceIngestion begins an asynchronous background job to crawl and index a workspace.
// It returns immediately with a success acknowledgment.
func StartWorkspaceIngestion(
	registry *fsutil.RootRegistry,
	tel *telemetry.Manager,
	vi *VectorIndex,
	targetPath string,
	workspaceID string,
	userID string,
	authToken string,
	apiBaseURL string,
) ToolExecutionResult {
	start := time.Now()

	// 1. Validate permissions before even starting the background job
	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "start_workspace_ingestion",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	// 2. Start the async goroutine
	go runAsyncIngestion(tel, vi, targetPath, workspaceID, userID, authToken, apiBaseURL)

	// 3. Return 202-style Accepted response
	outputMap := map[string]interface{}{
		"status":  "started",
		"message": "Workspace ingestion background job initiated.",
	}
	outBytes, _ := json.Marshal(outputMap)
	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}

func runAsyncIngestion(
	tel *telemetry.Manager,
	vi *VectorIndex,
	targetPath string,
	workspaceID string,
	userID string,
	authToken string,
	apiBaseURL string,
) {
	start := time.Now()

	defer func() {
		if r := recover(); r != nil {
			tel.FlushImmediate(telemetry.NewEvent(
				userID, workspaceID,
				telemetry.EventIngestionFailure,
				targetPath, "async_workspace_ingestion",
				time.Since(start), fmt.Errorf("panic during ingestion: %v", r),
			))
		}
	}()

	tel.FlushImmediate(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventIngestionStarted,
		targetPath, "async_workspace_ingestion",
		time.Since(start), nil,
	))

	existingFiles, err := vi.GetWorkspaceFiles(workspaceID)
	if err != nil {
		fmt.Printf("Warning: failed to get existing files for workspace %s: %v\n", workspaceID, err)
		existingFiles = []string{}
	}
	visitedFiles := make(map[string]bool)

	var currentBatch []FileChunk
	var batchStrings []string
	
	totalFilesProcessed := 0
	totalChunksIndexed := 0

	// Helper to flush a batch
	flushBatch := func() error {
		if len(currentBatch) == 0 {
			return nil
		}

		// 1. Fetch Embeddings
		embeddings, err := FetchEmbeddings(batchStrings, authToken)
		if err != nil {
			return fmt.Errorf("failed to fetch embeddings: %w", err)
		}

		// Group chunks by file to ensure we delete old chunks before inserting new ones
		filesInBatch := make(map[string]bool)
		for _, c := range currentBatch {
			filesInBatch[c.FilePath] = true
		}

		for filePath := range filesInBatch {
			if err := vi.DeleteFileChunks(workspaceID, filePath); err != nil {
				// Log but continue
				fmt.Printf("Warning: failed to delete old chunks for %s: %v\n", filePath, err)
			}
		}

		// 2. Insert into DB
		filePaths := make([]string, len(currentBatch))
		chunks := make([]string, len(currentBatch))
		
		for i, c := range currentBatch {
			filePaths[i] = c.FilePath
			chunks[i] = c.Content
		}

		// We need to pass the file path for each chunk. Wait, the InsertChunks signature
		// is func(workspaceId string, filePath string, chunks []string, embeddings [][]float32)
		// It assumes a single file per call.
		
		// Let's refactor the insertion call to iterate per-file, since our currentBatch might span multiple files.
		// Group by file:
		type fileGroup struct {
			chunks     []string
			embeddings [][]float32
		}
		grouped := make(map[string]*fileGroup)
		for i, c := range currentBatch {
			if grouped[c.FilePath] == nil {
				grouped[c.FilePath] = &fileGroup{}
			}
			grouped[c.FilePath].chunks = append(grouped[c.FilePath].chunks, c.Content)
			grouped[c.FilePath].embeddings = append(grouped[c.FilePath].embeddings, embeddings[i])
		}

		for filePath, group := range grouped {
			if err := vi.InsertChunks(workspaceID, filePath, group.chunks, group.embeddings); err != nil {
				return fmt.Errorf("failed to insert chunks for %s: %w", filePath, err)
			}
		}

		totalChunksIndexed += len(currentBatch)

		// Emit progress telemetry synchronously
		tel.FlushImmediate(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventIngestionProgress,
			targetPath, "async_workspace_ingestion",
			time.Since(start), nil, // We could pass a custom message in a real implementation
		))

		// Clear batch
		currentBatch = make([]FileChunk, 0, IngestionBatchSize)
		batchStrings = make([]string, 0, IngestionBatchSize)

		return nil
	}

	err = filepath.WalkDir(targetPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			if traversalExclusions[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}

		if !isSupportedTextFile(path) {
			return nil
		}

		info, err := d.Info()
		if err != nil || info.Size() > MaxExtractFileSize {
			return nil // Skip unreadable or too large files
		}

		contentBytes, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		// Optional: Skip binary looking files
		if bytesContainNull(contentBytes) {
			return nil
		}

		relPath, err := filepath.Rel(targetPath, path)
		if err != nil {
			relPath = path
		}
		visitedFiles[relPath] = true

		fileChunks := ChunkFile(relPath, string(contentBytes))
		
		for _, c := range fileChunks {
			currentBatch = append(currentBatch, c)
			batchStrings = append(batchStrings, c.Content)
			
			if len(currentBatch) >= IngestionBatchSize {
				if err := flushBatch(); err != nil {
					return err // Stop WalkDir on fatal embedding/db error
				}
			}
		}
		
		totalFilesProcessed++
		return nil
	})

	// Flush any remaining
	if err == nil {
		err = flushBatch()
	}

	// Delete orphaned files
	if err == nil {
		for _, existingFile := range existingFiles {
			if !visitedFiles[existingFile] {
				if deleteErr := vi.DeleteFileChunks(workspaceID, existingFile); deleteErr != nil {
					fmt.Printf("Warning: failed to delete orphaned file %s: %v\n", existingFile, deleteErr)
				}
			}
		}
	}

	if err != nil {
		tel.FlushImmediate(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventIngestionFailure,
			targetPath, "async_workspace_ingestion",
			time.Since(start), err,
		))
	} else {
		tel.FlushImmediate(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventIngestionComplete,
			targetPath, "async_workspace_ingestion",
			time.Since(start), nil,
		))
	}
}
