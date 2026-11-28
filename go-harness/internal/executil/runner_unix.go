//go:build !windows

package executil

import (
	"os/exec"
	"sync"
	"syscall"
)

func resolveExecutable(name string, _ Shell) (string, error) { return exec.LookPath(name) }

func startManaged(cmd *exec.Cmd, _ Shell, _ string) (func(), error) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			// Use the known child group ID, even if the group leader has exited.
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		})
	}, nil
}
