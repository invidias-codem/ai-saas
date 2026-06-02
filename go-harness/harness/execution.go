package harness

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/invidias-codem/ai-saas/go-harness/internal/fsutil"
	"github.com/invidias-codem/ai-saas/go-harness/internal/telemetry"
)

// ExecuteCommandSecure coordinates bounded, isolated local process execution.
func ExecuteCommandSecure(
	registry *fsutil.RootRegistry,
	tel *telemetry.Manager,
	commandLine string,
	targetDir string,
	workspaceID string,
	userID string,
	requestedTimeoutSeconds int,
) (string, error) {

	// 1. RULE 1: THE ROOT ANCHOR
	// Validate that the execution directory resides inside an authorized root grant.
	grant, err := registry.GetMatchingGrant(targetDir)
	if err != nil || grant == nil {
		tel.RecordEvent(telemetry.TelemetryEvent{
			EventType:    telemetry.EventCommandDenied,
			WorkspaceID:  workspaceID,
			UserID:       userID,
			PathAccessed: targetDir,
			Success:      false,
			ErrorMessage: "Execution directory containment check failed",
		})
		return "", fmt.Errorf("403 Forbidden: Cannot execute commands outside authorized workspace roots")
	}

	if grant.ReadOnly {
		tel.RecordEvent(telemetry.TelemetryEvent{
			EventType:    telemetry.EventCommandDenied,
			WorkspaceID:  workspaceID,
			UserID:       userID,
			PathAccessed: targetDir,
			Success:      false,
			ErrorMessage: "Attempted execution inside a Read-Only root",
		})
		return "", fmt.Errorf("403 Forbidden: Cannot execute commands within a Read-Only workspace root")
	}

	// 2. DEFENSE-IN-DEPTH: PREVENT SHELL INJECTION
	// Tokenize the command string into an explicit binary name and discrete argument vector.
	// This prevents command chaining (e.g., "npm test && rm -rf /") by completely bypassing shell parsing loops.
	fields := strings.Fields(strings.TrimSpace(commandLine))
	if len(fields) == 0 {
		return "", fmt.Errorf("400 Bad Request: Empty command string supplied")
	}
	binaryName := fields[0]
	binaryArgs := fields[1:]

	// 3. RULE 2: THE TIMEOUT GUILLOTINE
	// Calculate and cap the maximum allowable execution window.
	const maxAllowedTimeout = 120 * time.Second
	timeoutDuration := time.Duration(requestedTimeoutSeconds) * time.Second
	if timeoutDuration <= 0 || timeoutDuration > maxAllowedTimeout {
		timeoutDuration = maxAllowedTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeoutDuration)
	defer cancel()

	// Initialize the process context
	cmd := exec.CommandContext(ctx, binaryName, binaryArgs...)
	cmd.Dir = targetDir

	// 4. RULE 3: THE NON-INTERACTIVE GAG
	// Sever standard input and supply explicit automation signals to bypass blocking interactive prompts.
	cmd.Stdin = bytes.NewReader(nil) // Instantly EOFs if any process attempts to read stdin
	
	// Inherit base environment variables but append strict non-interactive forcing constraints
	cmd.Env = append(os.Environ(),
		"CI=true",
		"NONINTERACTIVE=1",
		"DEBIAN_FRONTEND=noninteractive",
	)

	// Combine stdout and stderr into a uniform telemetry tracking buffer
	var combinedOutputBuffer bytes.Buffer
	cmd.Stdout = &combinedOutputBuffer
	cmd.Stderr = &combinedOutputBuffer

	// Execute the binary
	executionErr := cmd.Run()

	// Handle execution result contexts
	if ctx.Err() == context.DeadlineExceeded {
		tel.RecordEvent(telemetry.TelemetryEvent{
			EventType:    telemetry.EventCommandTimeout,
			WorkspaceID:  workspaceID,
			UserID:       userID,
			PathAccessed: binaryName,
			Success:      false,
			ErrorMessage: fmt.Sprintf("Command timed out after %v", timeoutDuration),
		})
		return truncateOutput(combinedOutputBuffer.Bytes()), fmt.Errorf("504 Gateway Timeout: Execution exceeded safety window of %v", timeoutDuration)
	}

	if executionErr != nil {
		tel.RecordEvent(telemetry.TelemetryEvent{
			EventType:    telemetry.EventCommandExecuted,
			WorkspaceID:  workspaceID,
			UserID:       userID,
			PathAccessed: binaryName,
			Success:      false,
			ErrorMessage: executionErr.Error(),
		})
		return truncateOutput(combinedOutputBuffer.Bytes()), fmt.Errorf("execution failed: %w", executionErr)
	}

	// 5. RULE 4: THE OUTPUT TRUNCATOR ("HEAD AND TAIL")
	finalOutput := truncateOutput(combinedOutputBuffer.Bytes())

	tel.RecordEvent(telemetry.TelemetryEvent{
		EventType:    telemetry.EventCommandExecuted,
		WorkspaceID:  workspaceID,
		UserID:       userID,
		PathAccessed: binaryName,
		Success:      true,
	})

	return finalOutput, nil
}

// truncateOutput processes a raw execution output buffer utilizing the 
// Head-and-Tail semantic slicing convention to insulate LLM context limits.
func truncateOutput(output []byte) string {
	const maxOutputBytes = 10 * 1024 // 10KB Hard ceiling
	const headBytes = 2 * 1024       // Keep first 2KB (Initialization/Logs)
	const tailBytes = 8 * 1024       // Keep last 8KB (Stack-traces/Crash data)

	if len(output) <= maxOutputBytes {
		return string(output)
	}

	totalOmitted := len(output) - (headBytes + tailBytes)
	headSnippet := output[:headBytes]
	tailSnippet := output[len(output)-tailBytes:]

	var builder strings.Builder
	builder.Grow(maxOutputBytes + 128)
	builder.Write(headSnippet)
	builder.WriteString(fmt.Sprintf("\n\n... [OUTPUT TRUNCATED (%d bytes omitted by Lattice Execution Safety)] ...\n\n", totalOmitted))
	builder.Write(tailSnippet)

	return builder.String()
}
