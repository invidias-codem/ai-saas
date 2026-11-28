//go:build windows

package executil

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func resolveExecutable(name string, shell Shell) (string, error) {
	if shell == CMD || shell == PowerShell {
		dir, err := windows.GetSystemDirectory()
		if err != nil {
			return "", err
		}
		if shell == CMD {
			return filepath.Join(dir, "cmd.exe"), nil
		}
		return filepath.Join(dir, "WindowsPowerShell", "v1.0", "powershell.exe"), nil
	}
	return exec.LookPath(name)
}

// Start suspended, put the child in a kill-on-close job, then resume it.
// Assignment failure is fatal: never silently run an unmanaged process.
func startManaged(cmd *exec.Cmd, shell Shell, script string) (func(), error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, err
	}
	var once sync.Once
	stop := func() { once.Do(func() { _ = windows.CloseHandle(job) }) }
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		stop()
		return nil, err
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_SUSPENDED | windows.CREATE_NO_WINDOW}
	if shell == CMD {
		// cmd.exe's quoting is different from CommandLineToArgvW. /s removes the
		// outer quotes, leaving the approved script unchanged (including path quotes).
		cmd.SysProcAttr.CmdLine = syscall.EscapeArg(cmd.Path) + " /d /s /c \"" + script + "\""
	}
	if err = cmd.Start(); err != nil {
		stop()
		return nil, err
	}
	fail := func(cause error) (func(), error) {
		_ = cmd.Process.Kill()
		stop()
		_ = cmd.Wait()
		return nil, cause
	}
	process, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
	if err != nil {
		return fail(err)
	}
	err = windows.AssignProcessToJobObject(job, process)
	_ = windows.CloseHandle(process)
	if err != nil {
		return fail(fmt.Errorf("assign process to job: %w", err))
	}
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPTHREAD, 0)
	if err != nil {
		return fail(err)
	}
	defer windows.CloseHandle(snapshot)
	entry := windows.ThreadEntry32{Size: uint32(unsafe.Sizeof(windows.ThreadEntry32{}))}
	for err = windows.Thread32First(snapshot, &entry); err == nil; err = windows.Thread32Next(snapshot, &entry) {
		if entry.OwnerProcessID != uint32(cmd.Process.Pid) {
			continue
		}
		thread, openErr := windows.OpenThread(windows.THREAD_SUSPEND_RESUME, false, entry.ThreadID)
		if openErr != nil {
			return fail(openErr)
		}
		_, resumeErr := windows.ResumeThread(thread)
		_ = windows.CloseHandle(thread)
		if resumeErr != nil {
			return fail(resumeErr)
		}
		return stop, nil
	}
	return fail(fmt.Errorf("suspended process primary thread not found: %v", err))
}
