package patchutil

import (
	"bytes"
	"errors"
	"strings"
)

var (
	ErrFileIsBinary         = errors.New("cannot patch binary files")
	ErrPatchNoMatch         = errors.New("search block not found")
	ErrPatchMultipleMatches = errors.New("multiple matches found for search block")
)

// IsBinary checks if the content contains a null byte (\x00), identifying it as binary.
func IsBinary(content []byte) bool {
	return bytes.IndexByte(content, 0) != -1
}

// ExactReplace replaces searchBlock with replaceBlock in the content exactly once.
// Returns an error if the search block is not found or is non-unique, or if the file is binary.
func ExactReplace(content []byte, searchBlock, replaceBlock string) ([]byte, error) {
	if IsBinary(content) {
		return nil, ErrFileIsBinary
	}

	contentStr := string(content)
	count := strings.Count(contentStr, searchBlock)

	if count == 0 {
		return nil, ErrPatchNoMatch
	}
	if count > 1 {
		return nil, ErrPatchMultipleMatches
	}

	newContent := strings.Replace(contentStr, searchBlock, replaceBlock, 1)
	return []byte(newContent), nil
}
