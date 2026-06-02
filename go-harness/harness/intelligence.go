package harness

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

const MaxExtractFileSize = 100 * 1024 // 100KB

var supportedTextExtensions = map[string]bool{
	".txt": true, ".md": true, ".json": true, ".csv": true,
	".go": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true,
	".py": true, ".html": true, ".css": true, ".yml": true, ".yaml": true,
	".sh": true, ".sql": true, ".rs": true, ".c": true, ".cpp": true,
	".h": true, ".hpp": true, ".java": true,
}

var traversalExclusions = map[string]bool{
	".git": true, "node_modules": true, "vendor": true,
	"dist": true, "build": true, ".next": true, "target": true,
}

type DocumentMeta struct {
	Path      string `json:"path"`
	Size      int64  `json:"size"`
	Extension string `json:"extension"`
}

type RepoSummary struct {
	TopLevelDirectories []string           `json:"top_level_directories"`
	ConfiguredFiles     []string           `json:"configured_files"`
	FileDistribution    map[string]int     `json:"file_distribution"`
	TotalFilesScanned   int                `json:"total_files_scanned"`
}

func isSupportedTextFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return supportedTextExtensions[ext]
}

// DiscoverDocumentsSecure recursively scans a directory for supported text files.
func DiscoverDocumentsSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath, workspaceID, userID string) ToolExecutionResult {
	start := time.Now()

	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "discover_documents",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	var documents []DocumentMeta
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

		if isSupportedTextFile(path) {
			info, err := d.Info()
			if err == nil {
				documents = append(documents, DocumentMeta{
					Path:      path,
					Size:      info.Size(),
					Extension: filepath.Ext(path),
				})
			}
		}
		return nil
	})

	if err != nil {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventDocumentDiscoveryFailure,
			targetPath, "discover_documents",
			time.Since(start), err,
		))
		return ToolExecutionResult{Ok: false, Error: err.Error()}
	}

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventDocumentDiscoverySuccess,
		targetPath, "discover_documents",
		time.Since(start), nil,
	))

	outputMap := map[string]interface{}{
		"documents": documents,
		"count":     len(documents),
	}
	outBytes, _ := json.Marshal(outputMap)

	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}

// ExtractTextSecure safely reads a supported text file, enforcing a strict 100KB size limit.
func ExtractTextSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath, workspaceID, userID string) ToolExecutionResult {
	start := time.Now()

	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "extract_text",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	if !isSupportedTextFile(targetPath) {
		unsupportedErr := fmt.Errorf("Unsupported file type: only safe text extensions are allowed for extraction")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventUnsupportedLocalInput,
			targetPath, "extract_text",
			time.Since(start), unsupportedErr,
		))
		return ToolExecutionResult{Ok: false, Error: unsupportedErr.Error()}
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventDocumentExtractFailure,
			targetPath, "extract_text",
			time.Since(start), err,
		))
		return ToolExecutionResult{Ok: false, Error: err.Error()}
	}

	if info.Size() > MaxExtractFileSize {
		sizeErr := fmt.Errorf("File too large (%.2f KB). Maximum allowed size is 100KB to prevent context exhaustion.", float64(info.Size())/1024.0)
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventDocumentExtractFailure,
			targetPath, "extract_text",
			time.Since(start), sizeErr,
		))
		return ToolExecutionResult{Ok: false, Error: sizeErr.Error()}
	}

	content, err := os.ReadFile(targetPath)
	if err != nil {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventDocumentExtractFailure,
			targetPath, "extract_text",
			time.Since(start), err,
		))
		return ToolExecutionResult{Ok: false, Error: err.Error()}
	}

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventDocumentExtractSuccess,
		targetPath, "extract_text",
		time.Since(start), nil,
	))

	outputMap := map[string]interface{}{
		"content": string(content),
		"path":    targetPath,
		"size":    info.Size(),
	}
	outBytes, _ := json.Marshal(outputMap)
	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}

// SummarizeRepoSecure maps out a repository structure without returning full file contents.
func SummarizeRepoSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, targetPath, workspaceID, userID string) ToolExecutionResult {
	start := time.Now()

	grant, err := registry.GetMatchingGrant(targetPath)
	if err != nil || grant == nil {
		denialErr := fmt.Errorf("403 Forbidden: path not within any authorized root grant")
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRootAccessDenied,
			targetPath, "summarize_repo",
			time.Since(start), denialErr,
		))
		return ToolExecutionResult{Ok: false, Error: denialErr.Error(), Code: CodePathOutsideWorkspace}
	}

	summary := RepoSummary{
		TopLevelDirectories: []string{},
		ConfiguredFiles:     []string{},
		FileDistribution:    make(map[string]int),
	}

	majorConfigs := map[string]bool{
		"package.json": true, "go.mod": true, "Cargo.toml": true, "pyproject.toml": true,
		"requirements.txt": true, "dockerfile": true, "docker-compose.yml": true,
		"tsconfig.json": true, ".eslintrc.js": true, "webpack.config.js": true,
	}

	err = filepath.WalkDir(targetPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			if traversalExclusions[d.Name()] {
				return filepath.SkipDir
			}
			
			// Only capture immediate children of the targetPath for TopLevelDirectories
			if filepath.Dir(path) == filepath.Clean(targetPath) && path != targetPath {
				summary.TopLevelDirectories = append(summary.TopLevelDirectories, d.Name())
			}
			return nil
		}

		summary.TotalFilesScanned++
		ext := strings.ToLower(filepath.Ext(path))
		if ext != "" {
			summary.FileDistribution[ext]++
		}

		name := strings.ToLower(d.Name())
		if majorConfigs[name] {
			// Record config files relative to targetPath for clarity
			rel, err := filepath.Rel(targetPath, path)
			if err == nil {
				summary.ConfiguredFiles = append(summary.ConfiguredFiles, rel)
			} else {
				summary.ConfiguredFiles = append(summary.ConfiguredFiles, d.Name())
			}
		}

		return nil
	})

	if err != nil {
		tel.RecordEvent(telemetry.NewEvent(
			userID, workspaceID,
			telemetry.EventRepoSummaryFailure,
			targetPath, "summarize_repo",
			time.Since(start), err,
		))
		return ToolExecutionResult{Ok: false, Error: err.Error()}
	}

	tel.RecordEvent(telemetry.NewEvent(
		userID, workspaceID,
		telemetry.EventRepoSummarySuccess,
		targetPath, "summarize_repo",
		time.Since(start), nil,
	))

	outputMap := map[string]interface{}{
		"summary": summary,
	}
	outBytes, _ := json.Marshal(outputMap)
	return ToolExecutionResult{Ok: true, Output: string(outBytes)}
}
