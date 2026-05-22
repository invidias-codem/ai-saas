package patchutil

import (
	"bytes"
	"testing"
)

func TestExactReplace(t *testing.T) {
	tests := []struct {
		name         string
		content      []byte
		searchBlock  string
		replaceBlock string
		expectResult []byte
		expectErr    error
	}{
		{
			name:         "Single match success",
			content:      []byte("line 1\nTARGET_LINE\nline 3"),
			searchBlock:  "TARGET_LINE",
			replaceBlock: "REPLACED_LINE",
			expectResult: []byte("line 1\nREPLACED_LINE\nline 3"),
			expectErr:    nil,
		},
		{
			name:         "No match error",
			content:      []byte("line 1\nline 2\nline 3"),
			searchBlock:  "TARGET_LINE",
			replaceBlock: "REPLACED_LINE",
			expectResult: nil,
			expectErr:    ErrPatchNoMatch,
		},
		{
			name:         "Multiple matches error",
			content:      []byte("TARGET_LINE\nline 2\nTARGET_LINE"),
			searchBlock:  "TARGET_LINE",
			replaceBlock: "REPLACED_LINE",
			expectResult: nil,
			expectErr:    ErrPatchMultipleMatches,
		},
		{
			name:         "Literal special replacement tokens remain safe",
			content:      []byte("const val = REPLACE_ME;"),
			searchBlock:  "REPLACE_ME",
			replaceBlock: `"$$ && $& && $` + "`" + ` && $' && $1 && $PORT"`,
			expectResult: []byte(`const val = "$$ && $& && $` + "`" + ` && $' && $1 && $PORT";`),
			expectErr:    nil,
		},
		{
			name:         "Binary file rejection",
			content:      []byte("some text\x00with null byte"),
			searchBlock:  "text",
			replaceBlock: "data",
			expectResult: nil,
			expectErr:    ErrFileIsBinary,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := ExactReplace(tt.content, tt.searchBlock, tt.replaceBlock)
			if err != tt.expectErr {
				t.Errorf("ExactReplace() error = %v, expected %v", err, tt.expectErr)
				return
			}
			if tt.expectErr == nil && !bytes.Equal(res, tt.expectResult) {
				t.Errorf("ExactReplace() = %q, want %q", res, tt.expectResult)
			}
		})
	}
}
