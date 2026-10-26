//go:build windows

package executil

import (
	"context"
	"os/exec"
	"strings"
	"testing"
)

func TestWindowsShellExecution(t *testing.T) {
	for _, tc := range []struct {
		name         string
		shell        Shell
		script, want string
	}{
		{"cmd", CMD, `echo project result & exit /b 7`, "project result"},
		{"powershell", PowerShell, `Write-Output 'project result'; exit 7`, "project result"},
		{"pwsh", Pwsh, `Write-Output 'project result'; exit 7`, "project result"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.shell == Pwsh {
				if _, err := exec.LookPath("pwsh.exe"); err != nil {
					t.Skip("PowerShell 7 is optional on this host")
				}
			}
			res, err := RunCommand(context.Background(), t.TempDir(), tc.script, tc.shell, 10000, 1024)
			if err != nil || res.Ok || res.ExitCode != 7 || !strings.Contains(res.Output, tc.want) {
				t.Fatalf("wrong native shell outcome: %+v %v", res, err)
			}
		})
	}
}

func TestWindowsCMDQuotedWorkingDirectory(t *testing.T) {
	dir := t.TempDir() + `\project with spaces`
	// cmd builtins exercise CMD parsing; direct execution must not reinterpret them.
	res, err := RunCommand(context.Background(), t.TempDir(), `mkdir "`+dir+`" && cd /d "`+dir+`" && cd`, CMD, 5000, 4096)
	if err != nil || !res.Ok || !strings.Contains(res.Output, "project with spaces") {
		t.Fatalf("CMD quoting failed: %+v %v", res, err)
	}
}
