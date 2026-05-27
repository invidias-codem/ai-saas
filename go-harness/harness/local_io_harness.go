package harness

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/invidias-codem/ai-saas/go-harness/internal/executil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/patchutil"
)

// LocalIOHarness implements IOHarness utilizing Go 1.24+ os.Root to natively
// protect against directory traversal and symlink vulnerabilities.
type LocalIOHarness struct {
	workspaceRoot            string
	root                     *os.Root
	defaultCommandTimeoutMs  int
	maxOutputBytes           int
}

// NewLocalIOHarness constructs and canonicalizes a LocalIOHarness workspace.
func NewLocalIOHarness(workspaceRoot string) (*LocalIOHarness, error) {
	absRoot, err := filepath.Abs(workspaceRoot)
	if err != nil {
		return nil, fmt.Errorf("Failed to initialize harness: Workspace root inaccessible. %v", err)
	}

	stat, err := os.Stat(absRoot)
	if err != nil {
		return nil, fmt.Errorf("Failed to initialize harness: Workspace root inaccessible. %v", err)
	}
	if !stat.IsDir() {
		return nil, fmt.Errorf("Failed to initialize harness: Workspace root inaccessible. Workspace root is not a directory")
	}

	// Open the workspace root securely using os.OpenRoot to prevent symlink TOCTOU breakout races
	secureRoot, err := os.OpenRoot(absRoot)
	if err != nil {
		return nil, fmt.Errorf("Failed to initialize harness: Secure workspace root cannot be opened. %v", err)
	}

	return &LocalIOHarness{
		workspaceRoot:           absRoot,
		root:                    secureRoot,
		defaultCommandTimeoutMs: 30000,
		maxOutputBytes:          1024 * 512, // 512KB
	}, nil
}

// Close releases the os.Root descriptor resources.
func (h *LocalIOHarness) Close() error {
	if h.root != nil {
		return h.root.Close()
	}
	return nil
}

func (h *LocalIOHarness) ReadFile(ctx context.Context, filePath string) ToolExecutionResult {
	// First-line lexical containment check
	relPath, err := fsutil.GetRelativePath(h.workspaceRoot, filePath)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: err.Error(),
			Code:  CodePathOutsideWorkspace,
		}
	}

	// SECURE: Read relative to descriptor root
	content, err := h.root.ReadFile(relPath)
	if err != nil {
		if os.IsNotExist(err) {
			return ToolExecutionResult{
				Ok:    false,
				Error: fmt.Sprintf("Failed to read file: open %s: no such file or directory", filePath),
				Code:  CodeFileNotFound,
			}
		}
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to read file: %v", err),
			Code:  CodeReadError,
		}
	}

	return ToolExecutionResult{
		Ok:     true,
		Output: string(content),
	}
}

func (h *LocalIOHarness) WriteFile(ctx context.Context, filePath string, content string) ToolExecutionResult {
	// First-line lexical containment check
	relPath, err := fsutil.GetRelativePath(h.workspaceRoot, filePath)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: err.Error(),
			Code:  CodePathOutsideWorkspace,
		}
	}

	// Automatically create parent directories relative to os.Root
	parentDir := filepath.Dir(relPath)
	if parentDir != "." && parentDir != string(filepath.Separator) {
		err = h.root.MkdirAll(parentDir, 0755)
		if err != nil {
			return ToolExecutionResult{
				Ok:    false,
				Error: fmt.Sprintf("Failed to write file parent directory: %v", err),
				Code:  CodeWriteError,
			}
		}
	}

	// SECURE: Write relative to descriptor root
	err = h.root.WriteFile(relPath, []byte(content), 0644)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to write file: %v", err),
			Code:  CodeWriteError,
		}
	}

	return ToolExecutionResult{
		Ok:     true,
		Output: fmt.Sprintf("Successfully wrote to %s", filePath),
	}
}

func (h *LocalIOHarness) PatchFile(ctx context.Context, filePath string, searchBlock string, replaceBlock string) ToolExecutionResult {
	// First-line lexical containment check
	relPath, err := fsutil.GetRelativePath(h.workspaceRoot, filePath)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: err.Error(),
			Code:  CodePathOutsideWorkspace,
		}
	}

	// SECURE: Read relative to descriptor root
	content, err := h.root.ReadFile(relPath)
	if err != nil {
		if os.IsNotExist(err) {
			return ToolExecutionResult{
				Ok:    false,
				Error: fmt.Sprintf("Failed to patch file: open %s: no such file or directory", filePath),
				Code:  CodeFileNotFound,
			}
		}
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to patch file: %v", err),
			Code:  CodeReadError,
		}
	}

	// Apply exact replacements surgically and safely check for binary files
	patchedContent, err := patchutil.ExactReplace(content, searchBlock, replaceBlock)
	if err != nil {
		switch err {
		case patchutil.ErrFileIsBinary:
			return ToolExecutionResult{
				Ok:    false,
				Error: "Failed to patch file: cannot patch binary files",
				Code:  CodeInvalidArgument,
			}
		case patchutil.ErrPatchNoMatch:
			return ToolExecutionResult{
				Ok:    false,
				Error: fmt.Sprintf("Search block not found in %s", filePath),
				Code:  CodePatchNoMatch,
			}
		case patchutil.ErrPatchMultipleMatches:
			return ToolExecutionResult{
				Ok:    false,
				Error: fmt.Sprintf("Multiple matches found for search block in %s. Please provide a more specific search block.", filePath),
				Code:  CodePatchMultipleMatches,
			}
		default:
			return ToolExecutionResult{
				Ok:    false,
				Error: fmt.Sprintf("Failed to patch file: %v", err),
				Code:  CodeInternalError,
			}
		}
	}

	// SECURE: Write back relative to descriptor root
	err = h.root.WriteFile(relPath, patchedContent, 0644)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to patch write: %v", err),
			Code:  CodeWriteError,
		}
	}

	return ToolExecutionResult{
		Ok:     true,
		Output: fmt.Sprintf("Successfully patched %s", filePath),
	}
}

func (h *LocalIOHarness) RunCommand(ctx context.Context, command string, timeoutMs *int) ToolExecutionResult {
	timeout := h.defaultCommandTimeoutMs
	if timeoutMs != nil {
		timeout = *timeoutMs
	}

	// WAF Shell Interceptor: The Missing Link
	lowerCmd := strings.ToLower(command)
	if strings.Contains(lowerCmd, "api.github.com") || strings.Contains(lowerCmd, "github.com") || strings.Contains(lowerCmd, "gh ") {
		return ToolExecutionResult{
			Ok:    false,
			Error: "Error: Direct shell access to GitHub is restricted. Use the github_request tool.",
			Code:  CodeInvalidArgument,
		}
	}

	res, err := executil.RunShellCommand(ctx, h.workspaceRoot, command, timeout, h.maxOutputBytes)
	if err != nil {
		return ToolExecutionResult{
			Ok:    false,
			Error: fmt.Sprintf("Harness execution error: %v", err),
			Code:  CodeInternalError,
		}
	}

	// Format metadata state matching expectation schemas
	meta := map[string]interface{}{
		"isTruncated": res.Truncated,
		"isTimedOut":  res.TimedOut,
	}
	if res.ExitCode != -1 {
		meta["code"] = res.ExitCode
	}
	metaBytes, _ := json.Marshal(meta)

	var errCode string
	var errStr string
	var outputStr string

	trimmedOutput := strings.TrimSpace(res.Output)
	if res.Ok {
		if trimmedOutput == "" {
			outputStr = "Command completed successfully with no output."
		} else {
			outputStr = trimmedOutput
		}
		errStr = res.Error
	} else {
		outputStr = trimmedOutput
		if res.TimedOut {
			errCode = CodeCommandTimeout
		} else {
			errCode = CodeCommandExitNonZero
		}
		errStr = fmt.Sprintf("%s\nOutput:\n%s", res.Error, trimmedOutput)
	}

	return ToolExecutionResult{
		Ok:     res.Ok,
		Output: outputStr,
		Error:  errStr,
		Code:   errCode,
		Data:   metaBytes,
	}
}
