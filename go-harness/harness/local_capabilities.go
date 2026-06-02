package harness

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

// ReadFileSecure performs a grant-aware file read with injected context.
func ReadFileSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath string, workspaceID string, userID string) ToolExecutionResult {
	start := time.Now()
	
	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "read_file",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	content, err := os.ReadFile(targetPath)
	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventFileRead,
		targetPath, "read_file",
		time.Since(start), err,
	))

	if err != nil {
		return ToolExecutionResult{Ok: false, Error: err.Error(), Code: CodeReadError}
	}

	return ToolExecutionResult{Ok: true, Output: string(content)}
}

// ListDirectorySecure performs a grant-aware directory listing.
func ListDirectorySecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath string, workspaceID string, userID string) ToolExecutionResult {
	start := time.Now()
	
	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "list_directory",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	entries, err := os.ReadDir(targetPath)
	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventDirectoryList,
		targetPath, "list_directory",
		time.Since(start), err,
	))

	if err != nil {
		return ToolExecutionResult{Ok: false, Error: err.Error(), Code: CodeReadError}
	}

	// For simple tool output, encode entries as JSON or simple strings
	var output []string
	for _, e := range entries {
		info := fmt.Sprintf("%s (IsDir: %v)", e.Name(), e.IsDir())
		output = append(output, info)
	}
	outBytes, _ := json.Marshal(output)

	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}

// StatPathSecure performs a grant-aware stat operation.
func StatPathSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath string, workspaceID string, userID string) ToolExecutionResult {
	start := time.Now()
	
	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "stat_path",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	info, err := os.Stat(targetPath)
	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventStatPath,
		targetPath, "stat_path",
		time.Since(start), err,
	))

	if err != nil {
		return ToolExecutionResult{Ok: false, Error: err.Error(), Code: CodeReadError}
	}

	statData := map[string]interface{}{
		"name":  info.Name(),
		"size":  info.Size(),
		"mode":  info.Mode().String(),
		"isDir": info.IsDir(),
	}
	outBytes, _ := json.Marshal(statData)

	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}

// CreateFileSecure performs a grant-aware file creation.
func CreateFileSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath string, workspaceID string, userID string) ToolExecutionResult {
	start := time.Now()

	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "create_file",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	if grant.ReadOnly {
		denialErr := fmt.Errorf("403 Forbidden: root is explicitly set to Read-Only")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "create_file",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodeWriteError}
	}

	file, err := os.Create(targetPath)
	if err == nil {
		file.Close()
	}

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventFileCreate,
		targetPath, "create_file",
		time.Since(start), err,
	))

	if err != nil {
		return ToolExecutionResult{Ok: false, Error: err.Error(), Code: CodeWriteError}
	}

	return ToolExecutionResult{Ok: true, Output: "File created successfully"}
}

// WriteFileSecure performs a grant-aware file write.
func WriteFileSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath string, content string, workspaceID string, userID string) ToolExecutionResult {
	start := time.Now()

	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "write_file",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	if grant.ReadOnly {
		denialErr := fmt.Errorf("403 Forbidden: root is explicitly set to Read-Only")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "write_file",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodeWriteError}
	}

	err = os.WriteFile(targetPath, []byte(content), 0644)

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventFileWrite,
		targetPath, "write_file",
		time.Since(start), err,
	))

	if err != nil {
		return ToolExecutionResult{Ok: false, Error: err.Error(), Code: CodeWriteError}
	}

	return ToolExecutionResult{Ok: true, Output: "File written successfully"}
}

// CreateDirectorySecure performs a grant-aware directory creation.
func CreateDirectorySecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath string, workspaceID string, userID string) ToolExecutionResult {
	start := time.Now()

	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "create_directory",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	if grant.ReadOnly {
		denialErr := fmt.Errorf("403 Forbidden: root is explicitly set to Read-Only")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "create_directory",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodeWriteError}
	}

	err = os.MkdirAll(targetPath, 0755)

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventDirectoryCreate,
		targetPath, "create_directory",
		time.Since(start), err,
	))

	if err != nil {
		return ToolExecutionResult{Ok: false, Error: err.Error(), Code: CodeWriteError}
	}

	return ToolExecutionResult{Ok: true, Output: "Directory created successfully"}
}

// DeletePathSecure enforces the highest friction boundary.
// It requires both ReadOnly=false AND AllowDestructive=true.
func DeletePathSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath, workspaceID, userID string) ToolExecutionResult {
	start := time.Now()
	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "delete_path",
			time.Since(start), fmt.Errorf("403 Forbidden: path not within any authorized root grant"),
		))
		return ToolExecutionResult{Ok: false, Error: "403 Forbidden: Cannot delete outside authorized roots", Code: CodePathOutsideWorkspace}
	}

	if grant.ReadOnly {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			targetPath, "delete_path",
			time.Since(start), fmt.Errorf("403 Forbidden: Root is explicitly set to Read-Only"),
		))
		return ToolExecutionResult{Ok: false, Error: "403 Forbidden: Root is explicitly set to Read-Only", Code: CodeWriteError}
	}

	if !grant.AllowDestructive {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventDestructiveActionDenied,
			targetPath, "delete_path",
			time.Since(start), fmt.Errorf("403 Forbidden: Destructive operations must be explicitly permitted"),
		))
		return ToolExecutionResult{Ok: false, Error: "403 Forbidden: Destructive operations must be explicitly permitted by the user", Code: CodeWriteError}
	}

	// Use RemoveAll to cleanly handle both files and directories
	if err := os.RemoveAll(targetPath); err != nil {
		return ToolExecutionResult{Ok: false, Error: fmt.Sprintf("500 Internal Server Error: Failed to delete path: %v", err), Code: CodeWriteError}
	}

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventPathDelete,
		targetPath, "delete_path",
		time.Since(start), nil,
	))

	return ToolExecutionResult{Ok: true, Output: "Path deleted successfully"}
}

// MovePathSecure executes a strict dual-boundary permission evaluation.
func MovePathSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, srcPath, destPath, workspaceID, userID string) ToolExecutionResult {
	start := time.Now()
	srcGrant, err1 := registry.GetMatchingGrant(srcPath)
	destGrant, err2 := registry.GetMatchingGrant(destPath)

	if err1 != nil || err2 != nil || srcGrant == nil || destGrant == nil {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			fmt.Sprintf("%s -> %s", srcPath, destPath), "move_path",
			time.Since(start), fmt.Errorf("403 Forbidden: Move source and destination must both reside within authorized roots"),
		))
		return ToolExecutionResult{Ok: false, Error: "403 Forbidden: Move source and destination must both reside within authorized roots", Code: CodePathOutsideWorkspace}
	}

	// Both moving FROM a root and moving TO a root require write access
	if srcGrant.ReadOnly || destGrant.ReadOnly {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventMutationDenied,
			fmt.Sprintf("%s -> %s", srcPath, destPath), "move_path",
			time.Since(start), fmt.Errorf("403 Forbidden: Cannot move files to or from a Read-Only root"),
		))
		return ToolExecutionResult{Ok: false, Error: "403 Forbidden: Cannot move files to or from a Read-Only root", Code: CodeWriteError}
	}

	err := os.Rename(srcPath, destPath)
	
	// Trap the EXDEV (cross-device link) error
	if err != nil {
		if errors.Is(err, syscall.EXDEV) {
			// Trigger gracefully degraded manual copy-and-delete
			if fallbackErr := fallbackMoveFile(srcPath, destPath); fallbackErr != nil {
				return ToolExecutionResult{Ok: false, Error: fmt.Sprintf("500 Internal Server Error: Cross-device move fallback failed: %v", fallbackErr), Code: CodeWriteError}
			}
		} else {
			return ToolExecutionResult{Ok: false, Error: fmt.Sprintf("500 Internal Server Error: Failed to move path: %v", err), Code: CodeWriteError}
		}
	}

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventPathMove,
		fmt.Sprintf("%s -> %s", srcPath, destPath), "move_path",
		time.Since(start), nil,
	))

	return ToolExecutionResult{Ok: true, Output: "Path moved successfully"}
}

// fallbackMoveFile handles cross-partition EXDEV constraints for files.
func fallbackMoveFile(srcPath, destPath string) error {
	srcFile, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer srcFile.Close()

	destFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer destFile.Close()

	if _, err := io.Copy(destFile, srcFile); err != nil {
		return err
	}
	
	// Ensure buffers are flushed before attempting to delete source
	destFile.Sync()
	srcFile.Close()

	return os.Remove(srcPath)
}

// SemanticSearchSecure executes an in-memory cosine similarity search against local SQLite chunks.
func SemanticSearchSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, vectorIndex *VectorIndex, query string, workspaceID string, userID string, authToken string) ToolExecutionResult {
	start := time.Now()

	// 1. Fetch embeddings for the query
	queryEmbeddings, err := FetchEmbeddings([]string{query}, authToken)
	if err != nil || len(queryEmbeddings) == 0 {
		return ToolExecutionResult{Ok: false, Error: fmt.Sprintf("500 Internal Server Error: Failed to fetch query embedding: %v", err), Code: CodeReadError}
	}

	// 2. Search local SQLite
	results, err := vectorIndex.Search(workspaceID, queryEmbeddings[0], 5)
	if err != nil {
		return ToolExecutionResult{Ok: false, Error: fmt.Sprintf("500 Internal Server Error: Failed to search local vector index: %v", err), Code: CodeReadError}
	}

	// 3. Serialize output
	outBytes, _ := json.Marshal(results)

	// We log the telemetry event
	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventFileRead,
		"vector_index", "semantic_search_secure",
		time.Since(start), nil,
	))

	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}
