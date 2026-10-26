package harness

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/executil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

type CommandRequest struct {
	Command        string         `json:"command"`
	Shell          executil.Shell `json:"shell,omitempty"`
	TimeoutSeconds int            `json:"timeout_seconds"`
	Path           string         `json:"path"`
	WorkspaceID    string         `json:"workspace_id"`
	UserID         string         `json:"user_id"`
}

// ExecuteCommand checks a trusted caller's grant before starting any process.
// AllowDestructive is required because arbitrary code is not confined by cwd.
// Enterprise deployments must separately supply OS-level process isolation.
func ExecuteCommand(ctx context.Context, registry *fsutil.RootRegistry, tel *telemetry.Manager, req CommandRequest) ToolExecutionResult {
	deny := func(message string) ToolExecutionResult {
		tel.RecordEvent(telemetry.NewEvent(req.UserID, req.WorkspaceID, telemetry.EventCommandDenied, req.Path, "execute_command", 0, fmt.Errorf("%s", message)))
		return ToolExecutionResult{Error: "403 Forbidden: " + message, Code: "COMMAND_ACCESS_DENIED"}
	}
	if req.UserID == "" || req.WorkspaceID == "" {
		return deny("user and workspace identity are required")
	}
	// Resolve symlinks before checking the grant. cwd alone is not a jail.
	dir, err := filepath.EvalSymlinks(req.Path)
	if err != nil {
		return deny("execution directory is unavailable")
	}
	dir, err = filepath.Abs(dir)
	if err != nil {
		return deny("invalid execution directory")
	}
	grant, err := registry.GetMatchingGrant(dir)
	if err != nil || grant == nil {
		return deny("execution directory is outside authorized workspace roots")
	}
	if grant.UserID != req.UserID || (grant.WorkspaceID != "" && grant.WorkspaceID != req.WorkspaceID) {
		return deny("grant does not belong to this user and workspace")
	}
	if grant.ReadOnly {
		return deny("cannot execute commands within a Read-Only root")
	}
	if !grant.AllowDestructive {
		return deny("execution requires a destructive-capable root grant")
	}
	timeout := req.TimeoutSeconds
	if timeout <= 0 {
		timeout = 30
	}
	if timeout > 120 {
		timeout = 120
	}
	result, err := executil.RunCommand(ctx, dir, req.Command, req.Shell, timeout*1000, 10*1024)
	if err != nil {
		return ToolExecutionResult{Error: err.Error(), Code: CodeInvalidArgument}
	}
	meta, _ := json.Marshal(map[string]any{
		"shell": result.Shell, "code": result.ExitCode, "durationMs": result.DurationMs,
		"isTimedOut": result.TimedOut, "isCancelled": result.Cancelled, "isTruncated": result.Truncated,
	})
	var code string
	if !result.Ok {
		code = CodeCommandExitNonZero
	}
	if result.TimedOut {
		code = CodeCommandTimeout
	}
	if result.Cancelled {
		code = "COMMAND_CANCELLED"
	}
	if result.Truncated {
		code = "COMMAND_OUTPUT_LIMIT"
	}
	eventType := telemetry.EventCommandExecuted
	if result.TimedOut {
		eventType = telemetry.EventCommandTimeout
	}
	// Do not put scripts, command arguments, or captured output into telemetry.
	var eventErr error
	if !result.Ok {
		eventErr = fmt.Errorf("command failed: %s", code)
	}
	tel.RecordEvent(telemetry.NewEvent(req.UserID, req.WorkspaceID, eventType, dir, string(result.Shell), time.Duration(result.DurationMs)*time.Millisecond, eventErr))
	return ToolExecutionResult{Ok: result.Ok, Output: result.Output, Error: result.Error, Code: code, Data: meta}
}
