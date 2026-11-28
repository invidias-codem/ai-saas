package harness

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/invidias-codem/ai-saas/go-harness/internal/lifecycle"
	"github.com/invidias-codem/ai-saas/go-harness/internal/netguard"

	"path/filepath"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

const IngestionBatchSize = 1000 // chunks per embedding API request

// StartWorkspaceIngestion begins an asynchronous background job to crawl and index a workspace.
// It returns immediately with a success acknowledgment.
func StartWorkspaceIngestion(
	work *lifecycle.Group,
	registry *fsutil.RootRegistry,
	tel *telemetry.Manager,
	vi *VectorIndex,
	targetPath string,
	workspaceID string,
	userID string,
	authToken string,
	apiBaseURL string,
) ToolExecutionResult {
	// Validate identity and the pinned grant before scheduling any work.
	err := registry.WithGrantedPaths(userID, workspaceID, []fsutil.PathAccess{{Path: targetPath}}, func(_ []fsutil.GrantedPath) error { return nil })
	if err != nil {
		return ToolExecutionResult{Error: err.Error(), Code: CodePathOutsideWorkspace}
	}

	if authToken == "" {
		return ToolExecutionResult{Error: "Cloud authentication is required", Code: "UPSTREAM_AUTH_REQUIRED"}
	}
	if _, err := netguard.APIURL(apiBaseURL, workspaceID, "ingest"); err != nil {
		return ToolExecutionResult{Error: err.Error(), Code: CodeInvalidArgument}
	}

	if work == nil {
		return ToolExecutionResult{Error: "Owned background lifecycle is required", Code: "SERVICE_STOPPING"}
	}
	ctx, finish, err := work.Begin(work.Context())
	if err != nil {
		return ToolExecutionResult{Error: "Local service is stopping", Code: "SERVICE_STOPPING"}
	}
	go func() {
		defer finish()
		runAsyncIngestion(ctx, registry, tel, vi, targetPath, workspaceID, userID, authToken, apiBaseURL)
	}()

	// 3. Return 202-style Accepted response
	outputMap := map[string]interface{}{
		"status":  "started",
		"message": "Workspace ingestion background job initiated.",
	}
	outBytes, _ := json.Marshal(outputMap)
	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}

func runAsyncIngestion(
	ctx context.Context,
	registry *fsutil.RootRegistry,
	tel *telemetry.Manager,
	vi *VectorIndex,
	targetPath string,
	workspaceID string,
	userID string,
	authToken string,
	apiBaseURL string,
) {
	if ctx.Err() != nil {
		return
	}
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
		fmt.Printf("Warning: failed to get existing files for workspace %q: %v\n", workspaceID, err)
		existingFiles = []string{}
	}
	visitedFiles := make(map[string]bool)

	var currentBatch []FileChunk
	var batchStrings []string

	totalFilesProcessed := 0
	totalChunksIndexed := 0

	// Helper to flush a batch
	flushBatch := func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if len(currentBatch) == 0 {
			return nil
		}

		// 1. Fetch Embeddings
		embeddings, err := FetchEmbeddings(ctx, batchStrings, authToken)
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
				fmt.Printf("Warning: failed to delete old chunks for %q: %v\n", filePath, err)
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

	// Build an inventory through the granted descriptor, then recheck each
	// read. Never hold a registry lock across an HTTP request.
	discovered := DiscoverDocumentsSecure(registry, tel, targetPath, workspaceID, userID)
	var inventory struct {
		Documents []DocumentMeta `json:"documents"`
	}
	if !discovered.Ok {
		err = fmt.Errorf("document discovery failed: %s", discovered.Error)
	} else {
		err = json.Unmarshal([]byte(discovered.Output), &inventory)
	}
	if err == nil {
		for _, document := range inventory.Documents {
			if err = ctx.Err(); err != nil {
				break
			}
			if document.Size > MaxExtractFileSize {
				continue
			}
			var content []byte
			err = registry.WithGrantedPaths(userID, workspaceID, []fsutil.PathAccess{{Path: document.Path}}, func(paths []fsutil.GrantedPath) error {
				var readErr error
				content, readErr = fsutil.ReadRegularFile(paths[0].Root, paths[0].Name, MaxExtractFileSize)
				return readErr
			})
			if err != nil {
				break
			}
			if bytesContainNull(content) {
				continue
			}
			relPath, relErr := filepath.Rel(targetPath, document.Path)
			if relErr != nil {
				err = relErr
				break
			}
			visitedFiles[relPath] = true
			for _, chunk := range ChunkFile(relPath, string(content)) {
				currentBatch = append(currentBatch, chunk)
				batchStrings = append(batchStrings, chunk.Content)
				if len(currentBatch) >= IngestionBatchSize {
					err = flushBatch()
					if err != nil {
						break
					}
				}
			}
			if err != nil {
				break
			}
			totalFilesProcessed++
		}
	}

	// Flush any remaining
	if err == nil {
		err = flushBatch()
	}

	// Delete orphaned files
	if err == nil {
		for _, existingFile := range existingFiles {
			if err = ctx.Err(); err != nil {
				break
			}
			if !visitedFiles[existingFile] {
				if deleteErr := vi.DeleteFileChunks(workspaceID, existingFile); deleteErr != nil {
					fmt.Printf("Warning: failed to delete orphaned file %q: %v\n", existingFile, deleteErr)
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
