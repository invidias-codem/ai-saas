//go:build windows

package executil

import (
	"os/exec"
)

// SetGroupAttr is a stub on Windows.
func SetGroupAttr(cmd *exec.Cmd) {
	// CreationFlags can be set to CREATE_NEW_PROCESS_GROUP if needed,
	// but keeping it as a stub is sufficient for cross-platform parity.
}

// KillGroup aggressively terminates the main child process on Windows.
func KillGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	return cmd.Process.Kill()
}
