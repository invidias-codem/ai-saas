package harness

import "encoding/json"

// ToolExecutionResult represents the unified result envelope returned by all harness operations.
type ToolExecutionResult struct {
	Ok     bool            `json:"ok"`
	Output string          `json:"output,omitempty"`
	Error  string          `json:"error,omitempty"`
	Code   string          `json:"code,omitempty"`
	Data   json.RawMessage `json:"data,omitempty"`
}

// TruncationMetadata represents the machine-readable output truncation schema.
type TruncationMetadata struct {
	Truncated  bool `json:"truncated"`
	LimitBytes int  `json:"limitBytes"`
}

// Stable v1 error codes
const (
	CodeInvalidArgument       = "INVALID_ARGUMENT"
	CodePathOutsideWorkspace  = "PATH_OUTSIDE_WORKSPACE"
	CodeFileNotFound          = "FILE_NOT_FOUND"
	CodeReadError             = "READ_ERROR"
	CodeWriteError            = "WRITE_ERROR"
	CodePatchNoMatch          = "PATCH_NO_MATCH"
	CodePatchMultipleMatches  = "PATCH_MULTIPLE_MATCHES"
	CodeCommandTimeout        = "COMMAND_TIMEOUT"
	CodeCommandExitNonZero    = "COMMAND_EXIT_NONZERO"
	CodeInternalError         = "INTERNAL_ERROR"
)
