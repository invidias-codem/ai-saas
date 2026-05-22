package fsutil

import (
	"fmt"
	"path/filepath"
	"strings"
)

// GetRelativePath resolves the requested path against the workspace root,
// checks containment lexically, and returns the cleaned relative path if safe.
func GetRelativePath(workspaceRoot, filePath string) (string, error) {
	// Canonicalize workspace root
	rootAbs, err := filepath.Abs(workspaceRoot)
	if err != nil {
		return "", fmt.Errorf("failed to canonicalize workspace root: %w", err)
	}

	// Canonicalize target file path
	var targetAbs string
	if filepath.IsAbs(filePath) {
		targetAbs = filepath.Clean(filePath)
	} else {
		targetAbs = filepath.Clean(filepath.Join(rootAbs, filePath))
	}

	// Compute relative path from workspace root to target
	relPath, err := filepath.Rel(rootAbs, targetAbs)
	if err != nil {
		return "", fmt.Errorf("failed to calculate relative path: %w", err)
	}

	// Reject paths escaping the workspace root (starting with '..' or being absolute/drive-based)
	if relPath == ".." || strings.HasPrefix(relPath, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path validation failed: %s escapes workspace root", filePath)
	}

	return relPath, nil
}
