package executil

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"time"
)

// CommandResult represents the outcome of a command execution.
type CommandResult struct {
	Ok        bool
	Output    string
	Error     string
	ExitCode  int
	Signal    string
	Truncated bool
	TimedOut  bool
}

// RunShellCommand executes a command in a platform-appropriate shell (sh vs cmd.exe)
// with absolute bounds on timeout context and output size limits.
func RunShellCommand(ctx context.Context, workspaceRoot, command string, timeoutMs int, maxOutputBytes int) (*CommandResult, error) {
	// 1. Establish context timeout
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	// 2. Select appropriate shell per GOOS
	var shellName string
	var shellArgs []string
	if runtime.GOOS == "windows" {
		shellName = "cmd.exe"
		shellArgs = []string{"/c", command}
	} else {
		shellName = "sh"
		shellArgs = []string{"-c", command}
	}

	cmd := exec.CommandContext(timeoutCtx, shellName, shellArgs...)
	cmd.Dir = workspaceRoot

	// 3. Attach bounded writer capturing stdout & stderr together
	writer := NewBoundedWriter(maxOutputBytes)
	cmd.Stdout = writer
	cmd.Stderr = writer

	// 4. Configure process group attributes
	SetGroupAttr(cmd)

	// 5. Start the command execution
	if err := cmd.Start(); err != nil {
		return &CommandResult{
			Ok:    false,
			Error: fmt.Sprintf("Failed to spawn command: %v", err),
		}, nil
	}

	// 6. Wait for command completion or timeout cancellation
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	var waitErr error
	select {
	case <-timeoutCtx.Done():
		// Context timed out or was cancelled
		_ = KillGroup(cmd)
		
		// Wait for process resource cleanup
		<-done

		// Return timeout representation
		return &CommandResult{
			Ok:        false,
			TimedOut:  true,
			Truncated: writer.IsTruncated(),
			Output:    writer.String(),
			Error:     "Command timed out",
			ExitCode:  -1,
		}, nil
	case waitErr = <-done:
		// Process completed execution
	}

	// 7. Extract exit characteristics
	exitCode := 0
	var exitErr *exec.ExitError
	if waitErr != nil {
		if errors.As(waitErr, &exitErr) {
			exitCode = exitErr.ProcessState.ExitCode()
		} else {
			// Some other execution error occurred
			exitCode = -1
		}
	}

	// 8. Classify based on truncation status
	if writer.IsTruncated() {
		// Output size limit triggered (pipe broken intentionally)
		_ = KillGroup(cmd)
		return &CommandResult{
			Ok:        false,
			Truncated: true,
			Output:    writer.String(),
			Error:     "Command terminated due to output size limit",
			ExitCode:  exitCode,
		}, nil
	}

	// Success case vs normal execution failure
	if exitCode == 0 && waitErr == nil {
		return &CommandResult{
			Ok:        true,
			Output:    writer.String(),
			ExitCode:  0,
			Truncated: false,
			TimedOut:  false,
		}, nil
	}

	// Return exit non-zero result
	return &CommandResult{
		Ok:        false,
		Output:    writer.String(),
		Error:     fmt.Sprintf("Command failed with code %d", exitCode),
		ExitCode:  exitCode,
		Truncated: false,
		TimedOut:  false,
	}, nil
}
