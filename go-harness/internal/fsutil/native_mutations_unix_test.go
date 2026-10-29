//go:build !windows

package fsutil

import (
	"context"
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"testing"
)

func TestNativeMutationsRefuseSymlinkTargetsAndSpecialFiles(t *testing.T) {
	r, dir := mutationRegistry(t, true)
	if err := os.WriteFile(filepath.Join(dir, "real"), []byte("kept"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("real", filepath.Join(dir, "alias")); err != nil {
		t.Fatal(err)
	}
	if err := unix.Mkfifo(filepath.Join(dir, "fifo"), 0600); err != nil {
		t.Fatal(err)
	}
	// Keep a fixture writer present so even a regressed blocking-open flag cannot
	// strand the suite. The regular-file gate must still reject the FIFO unread.
	fd, err := unix.Open(filepath.Join(dir, "fifo"), unix.O_RDWR|unix.O_NONBLOCK, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer unix.Close(fd)
	for _, path := range []string{"alias", "fifo"} {
		if p, code := r.PrepareNativeTarget("u", "w", "g", path, "write_text"); code == "" {
			p.Close()
			t.Fatalf("prepared %s", path)
		}
	}
	data, _ := os.ReadFile(filepath.Join(dir, "real"))
	if string(data) != "kept" {
		t.Fatal("symlink target changed")
	}
}

func TestNativeMutationsDenyRelocatedRootWhileReadsStayPinned(t *testing.T) {
	parent := t.TempDir()
	path := filepath.Join(parent, "selected")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(path)
	if err != nil {
		t.Fatal(err)
	}
	id, err := ReadDirectoryIdentity(root)
	_ = root.Close()
	if err != nil {
		t.Fatal(err)
	}
	r := NewRootRegistry()
	defer r.Close()
	if err := r.UpdateNativeGrants("u", "w", []ReadGrant{{ID: "g", Path: path, Identity: id, Writable: true}}); err != nil {
		t.Fatal(err)
	}
	p, code := r.PrepareNativeTarget("u", "w", "g", "new", "create_file")
	if code != "" {
		t.Fatal(code)
	}
	defer p.Close()
	moved := filepath.Join(parent, "relocated")
	if err := os.Rename(path, moved); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if got := r.ApplyNativeMutation(context.Background(), "u", "w", "g", "new", "create_file", "wrong", p.Precondition); got.Code != "LOCAL_FILE_CONFLICT" || got.MayHaveChanged {
		t.Fatal(got)
	}
	for _, rootPath := range []string{path, moved} {
		if _, err := os.Stat(filepath.Join(rootPath, "new")); !os.IsNotExist(err) {
			t.Fatal("relocated/replacement root changed")
		}
	}
	if target, code := r.PrepareNativeTarget("u", "w", "g", "new", "create_file"); code == "" {
		target.Close()
		t.Fatal("prepared obsolete display root")
	}
	if err := r.WithGrantedRelativePath("u", "w", "g", ".", func(p GrantedPath) error {
		actual, e := ReadDirectoryIdentity(p.Root)
		if e != nil || actual != id {
			t.Fatal("read pin changed")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
