package harness

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type CrawlerConfig struct {
	WorkspaceID  string
	RepoFullName string
	AuthToken    string
	APIBaseURL   string
	GitHubToken  string
}

// Ignore list for standard noisy directories and files
var ignoredDirs = map[string]bool{
	".git":         true,
	"node_modules": true,
	"dist":         true,
	"build":        true,
	"vendor":       true,
	".next":        true,
	"__pycache__":  true,
}

var ignoredExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".svg": true, ".ico": true,
	".mp4": true, ".mp3": true, ".pdf": true, ".zip": true, ".tar": true, ".gz": true,
	".wasm": true, ".bin": true, ".exe": true, ".dll": true, ".so": true, ".dylib": true,
	".lock": true,
}

func CrawlAndIngest(config CrawlerConfig) error {
	// Create temp directory for cloning
	tmpDir, err := os.MkdirTemp("", "lattice-crawler-*")
	if err != nil {
		return fmt.Errorf("failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Build clone URL with auth token
	// https://x-access-token:<token>@github.com/<repo>.git
	cloneURL := fmt.Sprintf("https://x-access-token:%s@github.com/%s.git", config.GitHubToken, config.RepoFullName)

	// Shallow clone
	cmd := exec.Command("git", "clone", "--depth", "1", cloneURL, tmpDir)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("git clone failed: %v", err)
	}

	ingestClient := NewIngestClient(config.WorkspaceID, config.RepoFullName, config.AuthToken, config.APIBaseURL)

	// Walk directory
	err = filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// Skip ignored directories
		if info.IsDir() {
			if ignoredDirs[info.Name()] {
				return filepath.SkipDir
			}
			return nil
		}

		// Skip ignored extensions
		ext := strings.ToLower(filepath.Ext(info.Name()))
		if ignoredExtensions[ext] {
			return nil
		}

		// Read file content
		contentBytes, err := os.ReadFile(path)
		if err != nil {
			return nil // Skip unreadable files
		}

		// Verify it's text (skip if null byte found)
		if bytesContainNull(contentBytes) {
			return nil
		}

		relPath, _ := filepath.Rel(tmpDir, path)
		contentStr := string(contentBytes)

		// Chunk the file
		chunks := ChunkFile(relPath, contentStr)

		// Add chunks to ingest client
		for _, chunk := range chunks {
			if err := ingestClient.AddChunk(chunk); err != nil {
				return fmt.Errorf("failed to add chunk: %v", err)
			}
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("error walking repository: %v", err)
	}

	// Flush any remaining chunks
	if err := ingestClient.Flush(); err != nil {
		return fmt.Errorf("final flush failed: %v", err)
	}

	return nil
}

func bytesContainNull(b []byte) bool {
	for _, c := range b {
		if c == 0 {
			return true
		}
	}
	return false
}
