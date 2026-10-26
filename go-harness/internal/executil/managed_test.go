package executil

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestManagedProcessHelper(t *testing.T) {
	idx := -1
	for i, arg := range os.Args {
		if arg == "--lattice-helper" {
			idx = i
			break
		}
	}
	if idx < 0 {
		return
	}
	args := os.Args[idx+1:]
	switch args[0] {
	case "spawn":
		child := exec.Command(os.Args[0], "-test.run=^TestManagedProcessHelper$", "--", "--lattice-helper", "mark", args[1])
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		if err := child.Start(); err != nil {
			os.Exit(9)
		}
		time.Sleep(30 * time.Second)
	case "mark":
		_ = os.WriteFile(filepath.Join(args[1], "started"), []byte("ready"), 0600)
		time.Sleep(1500 * time.Millisecond)
		_ = os.WriteFile(filepath.Join(args[1], "escaped"), []byte("orphan"), 0600)
	case "spam":
		fmt.Print(strings.Repeat("x", 1024*1024))
		time.Sleep(30 * time.Second)
	case "wait":
		time.Sleep(30 * time.Second)
	case "credential":
		fmt.Print(os.Getenv("LATTICE_AUTH_TOKEN"))
	}
	os.Exit(0)
}

func TestManagedCredentialNotInherited(t *testing.T) {
	t.Setenv("LATTICE_AUTH_TOKEN", "daemon-secret")
	res, err := RunCommand(context.Background(), t.TempDir(), helperCommand(t, "credential"), Direct, 5000, 1024)
	if err != nil || !res.Ok || strings.Contains(res.Output, "daemon-secret") {
		t.Fatalf("daemon credential inherited: %+v %v", res, err)
	}
}

func helperCommand(t *testing.T, mode string, extra ...string) string {
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	command := `"` + exe + `" -test.run=^TestManagedProcessHelper$ -- --lattice-helper ` + mode
	for _, a := range extra {
		command += ` "` + a + `"`
	}
	return command
}

func TestManagedProcessCancelsDescendants(t *testing.T) {
	dir := t.TempDir()
	res, err := RunCommand(context.Background(), dir, helperCommand(t, "spawn", dir), Direct, 1000, 1024)
	if err != nil || !res.TimedOut {
		t.Fatalf("expected timeout: %+v %v", res, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "started")); err != nil {
		t.Fatalf("descendant did not start, test inconclusive: %v", err)
	}
	time.Sleep(800 * time.Millisecond)
	if _, err := os.Stat(filepath.Join(dir, "escaped")); !os.IsNotExist(err) {
		t.Fatalf("descendant escaped cleanup: %v", err)
	}
}

func TestManagedOutputLimitStopsProducer(t *testing.T) {
	start := time.Now()
	res, err := RunCommand(context.Background(), t.TempDir(), helperCommand(t, "spam"), Direct, 10000, 128)
	if err != nil || !res.Truncated || res.Ok || len(res.Output) > 256 {
		t.Fatalf("output limit failed: %+v %v", res, err)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatal("output producer continued after limit")
	}
}

func TestManagedCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(50*time.Millisecond, cancel)
	res, err := RunCommand(ctx, t.TempDir(), helperCommand(t, "wait"), Direct, 5000, 128)
	if err != nil || !res.Cancelled || res.TimedOut || res.Ok {
		t.Fatalf("lost cancellation: %+v %v", res, err)
	}
}
