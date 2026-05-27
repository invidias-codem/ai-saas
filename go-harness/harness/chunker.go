package harness

import (
	"regexp"
	"strings"
)

// Chunker configuration
const (
	MaxChunkSizeBytes = 4000 // Approximate fallback
)

// Structural patterns to split by
var (
	jsTsBoundary = regexp.MustCompile(`(?m)^(export\s+)?(class|function|interface|type|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s+`)
	goBoundary   = regexp.MustCompile(`(?m)^func\s+|^type\s+`)
	pyBoundary   = regexp.MustCompile(`(?m)^def\s+|^class\s+`)
)

type FileChunk struct {
	FilePath string `json:"file_path"`
	Content  string `json:"content_chunk"`
}

// ChunkFile uses heuristic regex to split code files structurally based on extension.
func ChunkFile(filePath string, content string) []FileChunk {
	var chunks []FileChunk
	var boundary *regexp.Regexp

	if strings.HasSuffix(filePath, ".ts") || strings.HasSuffix(filePath, ".tsx") ||
		strings.HasSuffix(filePath, ".js") || strings.HasSuffix(filePath, ".jsx") {
		boundary = jsTsBoundary
	} else if strings.HasSuffix(filePath, ".go") {
		boundary = goBoundary
	} else if strings.HasSuffix(filePath, ".py") {
		boundary = pyBoundary
	}

	if boundary != nil {
		// Find all boundaries
		indices := boundary.FindAllStringIndex(content, -1)
		
		if len(indices) > 0 {
			lastPos := 0
			for i, idx := range indices {
				if i == 0 {
					// Add imports/header
					if idx[0] > 0 {
						chunkText := strings.TrimSpace(content[0:idx[0]])
						if len(chunkText) > 0 {
							chunks = append(chunks, FileChunk{FilePath: filePath, Content: chunkText})
						}
					}
					lastPos = idx[0]
					continue
				}

				chunkText := strings.TrimSpace(content[lastPos:idx[0]])
				if len(chunkText) > 0 {
					chunks = append(chunks, FileChunk{FilePath: filePath, Content: chunkText})
				}
				lastPos = idx[0]
			}
			
			// Add the final chunk
			finalChunk := strings.TrimSpace(content[lastPos:])
			if len(finalChunk) > 0 {
				chunks = append(chunks, FileChunk{FilePath: filePath, Content: finalChunk})
			}
			
			return chunks
		}
	}

	// Fallback to size-based chunking if no structural boundaries are found
	return sizeBasedChunking(filePath, content)
}

func sizeBasedChunking(filePath string, content string) []FileChunk {
	var chunks []FileChunk
	lines := strings.Split(content, "\n")
	
	var currentChunk strings.Builder
	for _, line := range lines {
		if currentChunk.Len()+len(line) > MaxChunkSizeBytes && currentChunk.Len() > 0 {
			chunks = append(chunks, FileChunk{FilePath: filePath, Content: strings.TrimSpace(currentChunk.String())})
			currentChunk.Reset()
		}
		currentChunk.WriteString(line + "\n")
	}

	if currentChunk.Len() > 0 {
		chunks = append(chunks, FileChunk{FilePath: filePath, Content: strings.TrimSpace(currentChunk.String())})
	}
	
	return chunks
}
