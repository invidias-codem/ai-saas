package fsutil

import (
	"path/filepath"
	"testing"
)

func TestGetRelativePath(t *testing.T) {
	root := "/Users/jroot/Desktop/ai-nexus/ai-saas"

	tests := []struct {
		name      string
		input     string
		expectRel string
		expectErr bool
	}{
		{
			name:      "Simple relative path inside workspace",
			input:     "lib/harness/LocalIOHarness.ts",
			expectRel: filepath.Clean("lib/harness/LocalIOHarness.ts"),
			expectErr: false,
		},
		{
			name:      "Relative nested back and forth inside workspace",
			input:     "subfolder/inner/../../subfolder/inner/nested.txt",
			expectRel: filepath.Clean("subfolder/inner/nested.txt"),
			expectErr: false,
		},
		{
			name:      "Traversal escaping workspace root",
			input:     "../outside-file.txt",
			expectErr: true,
		},
		{
			name:      "Nested traversal escaping workspace root",
			input:     "subfolder/../../outside-file.txt",
			expectErr: true,
		},
		{
			name:      "Absolute path outside workspace",
			input:     "/etc/passwd",
			expectErr: true,
		},
		{
			name:      "Workspace root itself",
			input:     ".",
			expectRel: ".",
			expectErr: false,
		},
		{
			name:      "Absolute path inside workspace",
			input:     "/Users/jroot/Desktop/ai-nexus/ai-saas/lib/harness/LocalIOHarness.ts",
			expectRel: filepath.Clean("lib/harness/LocalIOHarness.ts"),
			expectErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rel, err := GetRelativePath(root, tt.input)
			if (err != nil) != tt.expectErr {
				t.Errorf("GetRelativePath() error = %v, expectErr = %v", err, tt.expectErr)
				return
			}
			if !tt.expectErr && rel != tt.expectRel {
				t.Errorf("GetRelativePath() = %v, want %v", rel, tt.expectRel)
			}
		})
	}
}

func TestIsPathContained(t *testing.T) {
	root := "/var/log/app"

	tests := []struct {
		name     string
		target   string
		expected bool
	}{
		{"Inside root", "/var/log/app/info.log", true},
		{"Same as root", "/var/log/app", true},
		{"Trailing slash root match", "/var/log/app/", true},
		{"Outside root", "/var/log/other.log", false},
		{"Path traversal outside", "/var/log/app/../../etc/passwd", false},
		{"Lexical trick (different folder starting with same name)", "/var/log/app-data/info.log", false},
		{"Relative path traversal outside", "../../../../etc/passwd", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			contained, _ := IsPathContained(root, tt.target)
			if contained != tt.expected {
				t.Errorf("IsPathContained() = %v, want %v for target %s", contained, tt.expected, tt.target)
			}
		})
	}
}
