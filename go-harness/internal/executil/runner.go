package executil

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type CommandResult struct {
	Ok         bool
	Output     string
	Error      string
	ExitCode   int
	Signal     string
	Truncated  bool
	TimedOut   bool
	Cancelled  bool
	Shell      Shell
	DurationMs int64
}

// RunShellCommand preserves the legacy platform shell for internal callers.
func RunShellCommand(ctx context.Context, root, command string, timeoutMs, limit int) (*CommandResult, error) {
	shell := SH
	if runtime.GOOS == "windows" {
		shell = CMD
	}
	return RunCommand(ctx, root, command, shell, timeoutMs, limit)
}

// RunCommand owns the whole process tree. It does not provide filesystem or
// network isolation; callers must provide OS restrictions for untrusted code.
func RunCommand(ctx context.Context, root, command string, shell Shell, timeoutMs, limit int) (*CommandResult, error) {
	args, err := commandArgs(runtime.GOOS, command, shell)
	if err != nil {
		return nil, err
	}
	if shell == "" {
		shell = Direct
	}
	if timeoutMs <= 0 {
		timeoutMs = 30000
	}
	if timeoutMs > 120000 {
		timeoutMs = 120000
	}
	if limit <= 0 || limit > 512*1024 {
		limit = 512 * 1024
	}
	started := time.Now()
	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()
	result := &CommandResult{ExitCode: -1, Shell: shell}
	finish := func() (*CommandResult, error) {
		result.DurationMs = time.Since(started).Milliseconds()
		return result, nil
	}
	if ctx.Err() != nil {
		result.TimedOut = errors.Is(ctx.Err(), context.DeadlineExceeded)
		result.Cancelled = !result.TimedOut
		result.Error = ctx.Err().Error()
		return finish()
	}
	name, err := resolveExecutable(args[0], shell)
	if err != nil {
		result.Error = fmt.Sprintf("Executable unavailable: %v", err)
		return finish()
	}
	cmd := exec.Command(name, args[1:]...)
	cmd.Dir = root
	// The daemon's RPC credential must never be inherited by executed scripts.
	for _, variable := range os.Environ() {
		key, _, _ := strings.Cut(variable, "=")
		if !strings.EqualFold(key, "LATTICE_AUTH_TOKEN") {
			cmd.Env = append(cmd.Env, variable)
		}
	}
	cmd.Env = append(cmd.Env, "CI=true", "NONINTERACTIVE=1")
	cmd.WaitDelay = time.Second
	writer := NewBoundedWriter(limit)
	cmd.Stdout, cmd.Stderr = writer, writer
	stop, err := startManaged(cmd, shell, command)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to start command: %v", err)
		return finish()
	}
	defer stop()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	var waitErr error
	select {
	case waitErr = <-done:
	case <-ctx.Done():
		stop()
		waitErr = <-done
		result.TimedOut = errors.Is(ctx.Err(), context.DeadlineExceeded)
		result.Cancelled = !result.TimedOut
	case <-writer.Exceeded():
		stop()
		waitErr = <-done
	}
	result.Output = writer.String()
	result.Truncated = writer.IsTruncated()
	if cmd.ProcessState != nil {
		result.ExitCode = cmd.ProcessState.ExitCode()
	}
	switch {
	case result.TimedOut:
		result.Error = "Command timed out"
	case result.Cancelled:
		result.Error = "Command cancelled"
	case result.Truncated:
		result.Error = "Command terminated due to output size limit"
	case waitErr != nil:
		result.Error = fmt.Sprintf("Command failed: %v", waitErr)
	default:
		result.Ok = true
	}
	return finish()
}
