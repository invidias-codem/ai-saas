package harness

import (
	"context"
	"fmt"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

// ExecuteCommandSecure is the backwards-compatible direct-execution entry point.
// Shell syntax is interpreted only when CommandRequest explicitly selects a shell.
func ExecuteCommandSecure(registry *fsutil.RootRegistry, tel *telemetry.Manager, commandLine, targetDir, workspaceID, userID string, timeoutSeconds int) (string, error) {
	res := ExecuteCommand(context.Background(), registry, tel, CommandRequest{Command: commandLine, Path: targetDir, WorkspaceID: workspaceID, UserID: userID, TimeoutSeconds: timeoutSeconds})
	if !res.Ok {
		if res.Code == CodeCommandTimeout {
			return res.Output, fmt.Errorf("504 Gateway Timeout: %s", res.Error)
		}
		return res.Output, fmt.Errorf("%s", res.Error)
	}
	return res.Output, nil
}
