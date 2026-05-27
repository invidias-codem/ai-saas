package harness

import "context"

// IOHarness defines the interface for local and remote device execution capabilities.
type IOHarness interface {
	ReadFile(ctx context.Context, filePath string) ToolExecutionResult
	WriteFile(ctx context.Context, filePath string, content string) ToolExecutionResult
	PatchFile(ctx context.Context, filePath string, searchBlock string, replaceBlock string) ToolExecutionResult
	RunCommand(ctx context.Context, command string, timeoutMs *int) ToolExecutionResult
}
