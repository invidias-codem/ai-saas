package fsutil

import (
	"path/filepath"
	"testing"
)

func TestGetRelativePath(t *testing.T) {
	root := t.TempDir()

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
			input:     filepath.Join(filepath.Dir(root), "outside.txt"),
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
			input:     filepath.Join(root, "lib/harness/LocalIOHarness.ts"),
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
	root := filepath.Join(t.TempDir(), "app")

	tests := []struct {
		name     string
		target   string
		expected bool
	}{
		{"Inside root", filepath.Join(root, "info.log"), true},
		{"Same as root", root, true},
		{"Trailing slash root match", root + string(filepath.Separator), true},
		{"Outside root", filepath.Join(filepath.Dir(root), "other.log"), false},
		{"Path traversal outside", filepath.Join(root, "../../etc/passwd"), false},
		{"Lexical trick (different folder starting with same name)", filepath.Join(root+"-data", "info.log"), false},
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
