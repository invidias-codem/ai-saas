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

// IsPathContained strictly verifies if a target path resides within an authorized root path.
// It cleans the paths to neutralize directory traversal attacks (e.g., ../../) and ensures
// lexical boundaries are respected.
func IsPathContained(root string, target string) (bool, error) {
	absRoot, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return false, fmt.Errorf("failed to resolve absolute root path: %v", err)
	}

	absTarget, err := filepath.Abs(filepath.Clean(target))
	if err != nil {
		return false, fmt.Errorf("failed to resolve absolute target path: %v", err)
	}

	// Exact match (requesting the root directory itself)
	if absTarget == absRoot {
		return true, nil
	}

	// Ensure root string has trailing separator for safe prefix checking.
	// E.g., root="/var/log" should not contain target="/var/logs/app.log"
	rootWithSep := absRoot
	if !strings.HasSuffix(rootWithSep, string(filepath.Separator)) {
		rootWithSep += string(filepath.Separator)
	}

	return strings.HasPrefix(absTarget, rootWithSep), nil
}
