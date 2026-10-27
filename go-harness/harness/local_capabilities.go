package harness

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

func withLocalPath(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user, event, operation string, write, destructive bool, fn func(fsutil.GrantedPath) (ToolExecutionResult, error)) ToolExecutionResult {
	start := time.Now()
	var result ToolExecutionResult
	err := registry.WithGrantedPaths(user, workspace, []fsutil.PathAccess{{Path: target, Write: write, Destructive: destructive}}, func(paths []fsutil.GrantedPath) error {
		var err error
		result, err = fn(paths[0])
		return err
	})
	if err != nil {
		switch event {
		case telemetry.EventDocumentDiscoverySuccess:
			event = telemetry.EventDocumentDiscoveryFailure
		case telemetry.EventDocumentExtractSuccess:
			event = telemetry.EventDocumentExtractFailure
		case telemetry.EventRepoSummarySuccess:
			event = telemetry.EventRepoSummaryFailure
		}
		code := CodeReadError
		if write {
			code = CodeWriteError
		}
		if strings.HasPrefix(err.Error(), "403 Forbidden") {
			code = CodePathOutsideWorkspace
			event = telemetry.EventRootAccessDenied
			if write {
				event = telemetry.EventMutationDenied
			}
			if strings.Contains(err.Error(), "Destructive") {
				event = telemetry.EventDestructiveActionDenied
			}
		}
		result = ToolExecutionResult{Error: err.Error(), Code: code}
	}
	tel.RecordEvent(telemetry.NewEvent(user, workspace, event, target, operation, time.Since(start), err))
	return result
}

func ReadFileSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventFileRead, "read_file", false, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		content, err := fsutil.ReadRegularFile(p.Root, p.Name, fsutil.MaxLocalReadBytes)
		return ToolExecutionResult{Ok: err == nil, Output: string(content)}, err
	})
}

func ListDirectorySecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventDirectoryList, "list_directory", false, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		dir, err := p.Root.Open(p.Name)
		if err != nil {
			return ToolExecutionResult{}, err
		}
		defer dir.Close()
		entries, err := dir.ReadDir(10001)
		if err != nil && err != io.EOF {
			return ToolExecutionResult{}, err
		}
		if len(entries) > 10000 {
			return ToolExecutionResult{}, fmt.Errorf("directory exceeds local tool entry limit")
		}
		output := make([]string, 0, len(entries))
		for _, entry := range entries {
			output = append(output, fmt.Sprintf("%s (IsDir: %v)", entry.Name(), entry.IsDir()))
		}
		data, err := json.Marshal(output)
		return ToolExecutionResult{Ok: err == nil, Output: string(data)}, err
	})
}

func StatPathSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventStatPath, "stat_path", false, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		info, err := p.Root.Stat(p.Name)
		if err != nil {
			return ToolExecutionResult{}, err
		}
		data, err := json.Marshal(map[string]any{"name": info.Name(), "size": info.Size(), "mode": info.Mode().String(), "isDir": info.IsDir()})
		return ToolExecutionResult{Ok: err == nil, Output: string(data)}, err
	})
}

func CreateFileSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventFileCreate, "create_file", true, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		f, err := fsutil.OpenRegularFile(p.Root, p.Name, os.O_WRONLY|os.O_CREATE|os.O_EXCL)
		if err != nil {
			return ToolExecutionResult{}, err
		}
		err = f.Close()
		return ToolExecutionResult{Ok: err == nil, Output: "File created successfully"}, err
	})
}

func WriteFileSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, content, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventFileWrite, "write_file", true, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		err := fsutil.WriteRegularFile(p.Root, p.Name, []byte(content))
		return ToolExecutionResult{Ok: err == nil, Output: "File written successfully"}, err
	})
}

func CreateDirectorySecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventDirectoryCreate, "create_directory", true, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		err := p.Root.MkdirAll(p.Name, 0700)
		return ToolExecutionResult{Ok: err == nil, Output: "Directory created successfully"}, err
	})
}

func DeletePathSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventPathDelete, "delete_path", true, true, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		err := p.Root.RemoveAll(p.Name)
		return ToolExecutionResult{Ok: err == nil, Output: "Path deleted successfully"}, err
	})
}

// Rename is confined to one pinned root. No path-based EXDEV copy/delete fallback.
func MovePathSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, src, dest, workspace, user string) ToolExecutionResult {
	start := time.Now()
	err := registry.WithGrantedPaths(user, workspace, []fsutil.PathAccess{{Path: src, Write: true}, {Path: dest, Write: true}}, func(paths []fsutil.GrantedPath) error {
		if paths[0].Root != paths[1].Root {
			return fmt.Errorf("cross-root moves are not supported")
		}
		return paths[0].Root.Rename(paths[0].Name, paths[1].Name)
	})
	tel.RecordEvent(telemetry.NewEvent(user, workspace, telemetry.EventPathMove, src, "move_path", time.Since(start), err))
	if err != nil {
		return ToolExecutionResult{Error: err.Error(), Code: CodeWriteError}
	}
	return ToolExecutionResult{Ok: true, Output: "Path moved successfully"}
}

// SemanticSearchSecure executes an in-memory cosine similarity search against local SQLite chunks.
func SemanticSearchSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, vectorIndex *VectorIndex, query string, workspaceID string, userID string, authToken string) ToolExecutionResult {
	start := time.Now()
	if authToken == "" {
		return ToolExecutionResult{Error: "Cloud authentication is required", Code: "UPSTREAM_AUTH_REQUIRED"}
	}

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
