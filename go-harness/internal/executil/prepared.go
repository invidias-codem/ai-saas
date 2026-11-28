package executil

import (
	"context"
	"errors"
	"os/exec"
	"time"
)

// RunPrepared applies the same group/job ownership to internal argv-based
// commands (such as Git). Its caller supplies the deadline and safe environment.
func RunPrepared(ctx context.Context, cmd *exec.Cmd, limit int) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	writer := NewBoundedWriter(limit)
	cmd.Stdout, cmd.Stderr = writer, writer
	cmd.WaitDelay = time.Second
	stop, err := startManaged(cmd, Direct, "")
	if err != nil {
		return err
	}
	defer stop()
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		stop()
		<-done
		return ctx.Err()
	case <-writer.Exceeded():
		stop()
		<-done
		return errors.New("internal command output limit exceeded")
	}
}
