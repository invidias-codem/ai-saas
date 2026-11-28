//go:build !windows

package fsutil

import (
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNativeDirectoryOpeningCannotBlockOnWorkspaceFIFO(t *testing.T) {
	dir := t.TempDir()
	fifo := filepath.Join(dir, "pipe")
	if err := unix.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	done := make(chan error, 1)
	go func() {
		f, err := OpenDirectory(root, "pipe")
		if f != nil {
			_ = f.Close()
		}
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("FIFO admitted as a directory")
		}
	case <-time.After(500 * time.Millisecond):
		// Release a regressed blocking open before failing, so test cleanup can
		// finish rather than leaving the native runtime waiting indefinitely.
		if f, err := os.OpenFile(fifo, os.O_WRONLY|unix.O_NONBLOCK, 0); err == nil {
			_ = f.Close()
		}
		t.Fatal("directory opening blocked on a FIFO")
	}
}
