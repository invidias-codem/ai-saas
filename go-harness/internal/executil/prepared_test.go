package executil

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestPreparedCommandCancelsDescendants(t *testing.T) {
	dir := t.TempDir()
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(exe, "-test.run=^TestManagedProcessHelper$", "--", "--lattice-helper", "spawn", dir)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if err := RunPrepared(ctx, cmd, 1024); err == nil {
		t.Fatal("expected cancelled internal command")
	}
	if _, err := os.Stat(filepath.Join(dir, "started")); err != nil {
		t.Fatal("descendant did not start", err)
	}
	time.Sleep(800 * time.Millisecond)
	if _, err := os.Stat(filepath.Join(dir, "escaped")); !os.IsNotExist(err) {
		t.Fatal("internal command descendant escaped cleanup")
	}
}
