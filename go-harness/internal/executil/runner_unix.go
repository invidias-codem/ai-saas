//go:build !windows

package executil

import (
	"os/exec"
	"syscall"
)

// SetGroupAttr sets pgid creation attributes on Unix to enable process group isolation.
func SetGroupAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// KillGroup kills the entire process group aggressively on Unix.
func KillGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err == nil {
		return syscall.Kill(-pgid, syscall.SIGKILL)
	}
	return cmd.Process.Kill()
}
