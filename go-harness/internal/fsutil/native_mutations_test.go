package fsutil

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func mutationRegistry(t *testing.T, writable bool) (*RootRegistry, string) {
	t.Helper()
	dir := t.TempDir()
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	id, err := ReadDirectoryIdentity(root)
	_ = root.Close()
	if err != nil {
		t.Fatal(err)
	}
	r := NewRootRegistry()
	t.Cleanup(func() { _ = r.Close() })
	if err := r.UpdateNativeGrants("u", "w", []ReadGrant{{ID: "g", Path: dir, Identity: id, Writable: writable}}); err != nil {
		t.Fatal(err)
	}
	return r, dir
}

func TestNativeMutationReplacementAndHardlinkAreRefused(t *testing.T) {
	r, dir := mutationRegistry(t, true)
	path := filepath.Join(dir, "note")
	if err := os.WriteFile(path, []byte("same bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	p, code := r.PrepareNativeTarget("u", "w", "g", "note", "write_text")
	if code != "" {
		t.Fatal(code)
	}
	defer p.Close()
	if err := os.Rename(path, filepath.Join(dir, "old")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("same bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	got := r.ApplyNativeMutation(context.Background(), "u", "w", "g", "note", "write_text", "wrong", p.Precondition)
	if got.Code != "LOCAL_FILE_CONFLICT" || got.MayHaveChanged {
		t.Fatal(got)
	}
	if err := os.Link(path, filepath.Join(dir, "alias")); err != nil {
		t.Fatal(err)
	}
	if target, code := r.PrepareNativeTarget("u", "w", "g", "note", "write_text"); code == "" {
		target.Close()
		t.Fatal("hardlink prepared")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "same bytes" {
		t.Fatal("replacement modified")
	}
}

func TestNativeMutationParentReplacementMissingParentsAndRootAreRefused(t *testing.T) {
	r, dir := mutationRegistry(t, true)
	sub := filepath.Join(dir, "sub")
	if err := os.Mkdir(sub, 0700); err != nil {
		t.Fatal(err)
	}
	p, code := r.PrepareNativeTarget("u", "w", "g", "sub/new", "create_file")
	if code != "" {
		t.Fatal(code)
	}
	defer p.Close()
	err := os.Rename(sub, filepath.Join(dir, "old"))
	if runtime.GOOS == "windows" {
		if err == nil {
			t.Fatal("pinned Windows parent unexpectedly moved")
		}
		p.Close()
		err = os.Rename(sub, filepath.Join(dir, "old"))
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(sub, 0700); err != nil {
		t.Fatal(err)
	}
	got := r.ApplyNativeMutation(context.Background(), "u", "w", "g", "sub/new", "create_file", "wrong", p.Precondition)
	if got.Code != "LOCAL_FILE_CONFLICT" || got.MayHaveChanged {
		t.Fatal(got)
	}
	for _, path := range []string{".", "missing/new"} {
		if target, code := r.PrepareNativeTarget("u", "w", "g", path, "create_directory"); code == "" {
			target.Close()
			t.Fatal("invalid target prepared")
		}
	}
	if _, err := os.Stat(filepath.Join(sub, "new")); !os.IsNotExist(err) {
		t.Fatal("replaced parent modified")
	}
}

func TestNativeMutationsRefuseLinkedParentsAndNestedReadOnlyRoots(t *testing.T) {
	r, dir := mutationRegistry(t, true)
	ro := filepath.Join(dir, "restricted")
	if err := os.Mkdir(ro, 0700); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	id, err := ReadDirectoryIdentity(root)
	if err != nil {
		t.Fatal(err)
	}
	child, err := os.OpenRoot(ro)
	if err != nil {
		t.Fatal(err)
	}
	defer child.Close()
	childID, err := ReadDirectoryIdentity(child)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.UpdateNativeGrants("u", "w", []ReadGrant{{ID: "g", Path: dir, Identity: id, Writable: true}, {ID: "ro", Path: ro, Identity: childID}}); err != nil {
		t.Fatal(err)
	}
	p, code := r.PrepareNativeTarget("u", "w", "g", "restricted/new", "create_file")
	if code != "" {
		t.Fatal(code)
	}
	defer p.Close()
	if got := r.ApplyNativeMutation(context.Background(), "u", "w", "g", "restricted/new", "create_file", "wrong", p.Precondition); got.Code != "LOCAL_FILE_CONFLICT" || got.MayHaveChanged {
		t.Fatal(got)
	}
	outside := t.TempDir()
	link := filepath.Join(dir, "linked")
	if runtime.GOOS == "windows" {
		if data, err := exec.Command("cmd", "/C", "mklink", "/J", link, outside).CombinedOutput(); err != nil {
			t.Fatalf("junction fixture: %v %s", err, data)
		}
	} else {
		if err := os.Symlink(outside, link); err != nil {
			t.Fatal(err)
		}
	}
	if target, code := r.PrepareNativeTarget("u", "w", "g", "linked/new", "create_file"); code == "" {
		target.Close()
		t.Fatal("linked parent prepared")
	}
	if _, err := os.Stat(filepath.Join(ro, "new")); !os.IsNotExist(err) {
		t.Fatal("read-only root changed")
	}
	if _, err := os.Stat(filepath.Join(outside, "new")); !os.IsNotExist(err) {
		t.Fatal("link escaped root")
	}
}

func TestNativeMutationsAreExclusiveAndCheckCompleteBase(t *testing.T) {
	r, dir := mutationRegistry(t, true)
	prepare := func(kind, path string) *PreparedTarget {
		t.Helper()
		p, code := r.PrepareNativeTarget("u", "w", "g", path, kind)
		if code != "" {
			t.Fatal(code)
		}
		t.Cleanup(p.Close)
		return p
	}
	p := prepare("create_file", "note.txt")
	result := r.ApplyNativeMutation(context.Background(), "u", "w", "g", "note.txt", "create_file", "first", p.Precondition)
	if result.Code != "" {
		t.Fatal(result)
	}
	if result = r.ApplyNativeMutation(context.Background(), "u", "w", "g", "note.txt", "create_file", "wrong", p.Precondition); result.Code != "LOCAL_FILE_CONFLICT" {
		t.Fatal(result)
	}
	p = prepare("write_text", "note.txt")
	if err := os.WriteFile(filepath.Join(dir, "note.txt"), []byte("external"), 0600); err != nil {
		t.Fatal(err)
	}
	if result = r.ApplyNativeMutation(context.Background(), "u", "w", "g", "note.txt", "write_text", "wrong", p.Precondition); result.Code != "LOCAL_FILE_CONFLICT" {
		t.Fatal(result)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "note.txt"))
	if string(data) != "external" {
		t.Fatal("external edit lost")
	}
	p = prepare("write_text", "note.txt")
	if result = r.ApplyNativeMutation(context.Background(), "u", "w", "g", "note.txt", "write_text", "ok", p.Precondition); result.Code != "" {
		t.Fatal(result)
	}
	data, _ = os.ReadFile(filepath.Join(dir, "note.txt"))
	if string(data) != "ok" {
		t.Fatal("write/truncate failed")
	}
	p = prepare("create_directory", "new-dir")
	if result = r.ApplyNativeMutation(context.Background(), "u", "w", "g", "new-dir", "create_directory", "", p.Precondition); result.Code != "" {
		t.Fatal(result)
	}
}

func TestNativeReadOnlyAndCancelledMutationsHaveNoEffects(t *testing.T) {
	r, dir := mutationRegistry(t, false)
	p, code := r.PrepareNativeTarget("u", "w", "g", "absent", "create_file")
	if code != "" {
		t.Fatal(code)
	}
	defer p.Close()
	if got := r.ApplyNativeMutation(context.Background(), "u", "w", "g", "absent", "create_file", "x", p.Precondition); got.Code != "LOCAL_WRITE_GRANT_REQUIRED" {
		t.Fatal(got)
	}
	if _, err := os.Stat(filepath.Join(dir, "absent")); !os.IsNotExist(err) {
		t.Fatal("read-only mutation")
	}
	rw, rwdir := mutationRegistry(t, true)
	q, code := rw.PrepareNativeTarget("u", "w", "g", "absent", "create_file")
	if code != "" {
		t.Fatal(code)
	}
	defer q.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if got := rw.ApplyNativeMutation(ctx, "u", "w", "g", "absent", "create_file", "x", q.Precondition); got.Code != "LOCAL_OPERATION_CANCELLED" {
		t.Fatal(got)
	}
	if _, err := os.Stat(filepath.Join(rwdir, "absent")); !os.IsNotExist(err) {
		t.Fatal("cancelled mutation")
	}
}
