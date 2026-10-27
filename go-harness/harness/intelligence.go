package harness

import (
	"encoding/json"

	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

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
	TopLevelDirectories []string       `json:"top_level_directories"`
	ConfiguredFiles     []string       `json:"configured_files"`
	FileDistribution    map[string]int `json:"file_distribution"`
	TotalFilesScanned   int            `json:"total_files_scanned"`
}

func isSupportedTextFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return supportedTextExtensions[ext]
}

// walkGranted uses only descriptor-relative directory traversal. Symlink entries
// are excluded; extraction separately opens a bounded regular-file descriptor.
func walkGranted(p fsutil.GrantedPath, visit func(string, fs.DirEntry) error) error {
	root, err := p.Root.OpenRoot(p.Name)
	if err != nil {
		return err
	}
	defer root.Close()
	count := 0
	return fs.WalkDir(root.FS(), ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		count++
		if count > 10000 {
			return errors.New("workspace scan exceeds local tool entry limit")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		if entry.IsDir() && traversalExclusions[entry.Name()] {
			return fs.SkipDir
		}
		return visit(name, entry)
	})
}

func DiscoverDocumentsSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventDocumentDiscoverySuccess, "discover_documents", false, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		documents := []DocumentMeta{}
		err := walkGranted(p, func(name string, entry fs.DirEntry) error {
			if entry.IsDir() || !isSupportedTextFile(name) {
				return nil
			}
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if info.Mode().IsRegular() {
				documents = append(documents, DocumentMeta{Path: filepath.Join(target, filepath.FromSlash(name)), Size: info.Size(), Extension: filepath.Ext(name)})
			}
			return nil
		})
		if err != nil {
			return ToolExecutionResult{}, err
		}
		data, err := json.Marshal(map[string]any{"documents": documents, "count": len(documents)})
		return ToolExecutionResult{Ok: err == nil, Output: string(data)}, err
	})
}

func ExtractTextSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventDocumentExtractSuccess, "extract_text", false, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		if !isSupportedTextFile(p.Name) {
			return ToolExecutionResult{}, errors.New("Unsupported file type: only text extensions are allowed")
		}
		content, err := fsutil.ReadRegularFile(p.Root, p.Name, MaxExtractFileSize)
		if err != nil {
			return ToolExecutionResult{}, err
		}
		data, err := json.Marshal(map[string]any{"content": string(content), "path": target, "size": len(content)})
		return ToolExecutionResult{Ok: err == nil, Output: string(data)}, err
	})
}

func SummarizeRepoSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, target, workspace, user string) ToolExecutionResult {
	return withLocalPath(registry, tel, target, workspace, user, telemetry.EventRepoSummarySuccess, "summarize_repo", false, false, func(p fsutil.GrantedPath) (ToolExecutionResult, error) {
		summary := RepoSummary{TopLevelDirectories: []string{}, ConfiguredFiles: []string{}, FileDistribution: map[string]int{}}
		configs := map[string]bool{"package.json": true, "go.mod": true, "cargo.toml": true, "pyproject.toml": true, "requirements.txt": true, "dockerfile": true, "docker-compose.yml": true, "tsconfig.json": true, ".eslintrc.js": true, "webpack.config.js": true}
		err := walkGranted(p, func(name string, entry fs.DirEntry) error {
			if entry.IsDir() {
				if name != "." && !strings.Contains(name, "/") {
					summary.TopLevelDirectories = append(summary.TopLevelDirectories, entry.Name())
				}
				return nil
			}
			summary.TotalFilesScanned++
			if ext := strings.ToLower(filepath.Ext(name)); ext != "" {
				summary.FileDistribution[ext]++
			}
			if configs[strings.ToLower(entry.Name())] {
				summary.ConfiguredFiles = append(summary.ConfiguredFiles, name)
			}
			return nil
		})
		if err != nil {
			return ToolExecutionResult{}, err
		}
		data, err := json.Marshal(map[string]any{"summary": summary})
		return ToolExecutionResult{Ok: err == nil, Output: string(data)}, err
	})
}
